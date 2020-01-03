import Discord, { Guild, Channel } from 'discord.js'

import prand from './lib/pseudoRandom'
import Data from './data'

export default class EverythingHandler {
  private client: Discord.Client
  private data: Data
  private globalData!: GlobalQuestData
  constructor(client: Discord.Client, data: Data) {
    client.on('message', this.onGuildMemberAdd)
    client.on('message', this.onMessage)

    this.client = client
    this.data = data
    this.init()
  }

  private async init() {
    this.globalData = await this.data.load('global', 'questData', {}) as GlobalQuestData
  }

  private async onGuildMemberAdd(member: Discord.GuildMember) {
    const data = await this.getData(member.guild)
    data.userData[member.id] = {
      quests: [],
    }

    this.start(member.id, member.guild.id)
  }

  private async onMessage(msg: Discord.Message) {
    if (msg.channel.type === 'dm') {
      const activeGuild = this.globalData[msg.member.id].activeGuild
      if (activeGuild) {
        const data = this.data.getData(activeGuild, 'GuildData') as GuildData | undefined
        if (data?.ready) {
          const question = data.quest.questions[data.userData[msg.member.id].quests[0].question]
          const answers = this.getSeededAnswers(msg.member.id, msg.guild.id, question.answers)
          if (!answers) return

          const prefixes = this.getSeededPrefixes(answers)
          const index = prefixes.indexOf(msg.content.toLowerCase())
          if (index !== -1) {
            this.advance(answers[index], msg.member.id, activeGuild)
          }
        }
      }
    } else if (msg.channel.type === 'text') {
      const data = await this.getData(msg.guild)
      if (!data.ready) return
      if (data.botChannels.includes(msg.channel.id)) {
        const userData = data.userData[msg.member.id]
        if (!userData) {
          // Start quest if somehow never was caught with onGuildMemberAdd
          await this.onGuildMemberAdd(msg.member)
        } else if (userData.quests.length === 0) {
          // Start quest if somehow never started
          this.start(msg.member.id, msg.member.guild.id)
        }
      }
    }
  }

  private advance(answer: Answer, member: MemberId, guild: GuildId) {
    const data = this.data.getData(guild, 'GuildData') as GuildData | undefined
    if (data?.ready) {
      const quest = data.userData[member].quests[0]
      if (answer.points) {
        if (!quest.points) quest.points = {}
        for (const faction in answer.points) {
          quest.points[faction] = quest.points[faction] ?? 0 + this.getRandomValue(answer.points[faction])
        }
      }

      if (answer.message) this.message(this.getRandomValue(answer.message), member)
      if (answer.target === 'start') {
        this.start(member, guild)
      } else if (answer.target === 'skip') {
        this.skip(member, guild)
      } else if (answer.target === 'good') {
        this.good(member, guild)
      } else if (answer.target === 'bad') {
        this.bad(member, guild)
      } else {
        quest.question = this.getRandomValue(answer.target)
        this.displayQuestion(data.quest.questions[quest.question], member)
      }
    }
  }

  private async displayQuestion(question: Question, memberId: MemberId) {
    const activeGuild = this.globalData[memberId].activeGuild

    const answers = this.getSeededAnswers(memberId, activeGuild, question.answers)
    if (!answers) return

    const prefixes = this.getSeededPrefixes(answers)
    const answersStrs = answers.map((v: typeof answers[number], i: number) => `${prefixes[i]} ${v}`)

    this.message(this.getRandomValue(question.text) + answersStrs.join('\n\n'), memberId)
  }

  private getSeededPrefixes(seededAnswers: Answer[]) { return seededAnswers.map((v, i) => v.prefix || i.toString()) }

  private getSeededAnswers(member: MemberId, guild: GuildId, answers: Question['answers']) {
    const res: Answer[] = []
    const data = this.getDataBasic(guild)
    if (!data) return
    for (const answer of answers) {
      if (Array.isArray(answer)) {
        const rand = Math.floor(prand(this.getPrandSeed(data.userData[member].quests[0].startTime, member), 0, answer.length + 0.999))
        res.push(answer[rand])
      } else {
        res.push(answer)
      }
    }
    return res
  }

  private async message(msg: string, user: UserId) {
    await (await this.client.fetchUser(user, true)).send(msg)
  }

  /**
   * **If T is an array itself don't use this method!!**  
   * @returns If `randomizable` is an array, a random element in that array, otherwise, `randomizable` is returned
   */
  private getRandomValue<T>(randomizable: Randomizable<T>): T extends any[] ? T[number] : T {
    return (Array.isArray(randomizable) ? randomizable[Math.random() * randomizable.length - 1] : randomizable) as T extends any[] ? T[number] : T
  }

  private getPrandSeed(startTime: number, member: MemberId) {
    return startTime + member
  }

  private async getData(guild: Discord.Guild): Promise<GuildData> {
    let data = this.data.getData(guild.id, 'guildData') as GuildData | undefined
    if (!data) {
      const channel = guild.channels.first()
      const defaults: GuildData = { ...channel ? { botChannels: channel.id } : {}, ...{ ready: false, userData: {} } }
      this.data.load(guild.id, 'GuildData', defaults)
      data = (await this.data.waitData(guild.id, 'GuildData', 3)) as GuildData | undefined
    }
    if (!data) {
      throw new Error('Didnt load in time and stuff went broke mate')
    }
    return data
  }
  private getDataBasic(guild: GuildId) {
    return this.data.getData(guild, 'guildData') as GuildData | undefined
  }

  private setFactionFromPoints(quest: UserData['quests'][number]) {
    const points = quest.points!
    if (points) {
      let max = -Infinity
      for (const faction in points) {
        if (points[faction] > max) {
          quest.faction = faction
          max = points[faction]
        }
      }
    }
  }

  private validate() {
    return true
  }

  private async start(member: MemberId, guild: GuildId) {
    const data = this.getDataBasic(guild)
    if (data?.ready) {
      const userData = data.userData[member]
      if (userData.quests.length === 0 || userData.quests[0].endTime) {
        userData.quests.push({ question: this.getRandomValue(data.quest.startQuestion), startTime: Date.now(), attempts: 1 })
      } else {
        const quest = userData.quests[0]
        quest.attempts++
        quest.question = this.getRandomValue(data.quest.startQuestion)
        quest.startTime = Date.now()
        delete quest.points
      }
      userData.quests[0].startTime = Date.now()
    }
  }

  private async skip(member: MemberId, guild: GuildId) {
    const data = this.getDataBasic(guild)
    if (data?.ready) {
      const userData = data.userData[member]
      const quest = userData.quests[0]
      quest.result = 'skip'
      quest.endTime = Date.now()
    }
  }

  private async bad(member: MemberId, guild: GuildId) {
    const data = this.getDataBasic(guild)
    if (data?.ready) {
      const userData = data.userData[member]
      const quest = userData.quests[0]
      quest.result = 'bad'
      quest.endTime = Date.now()
      this.setFactionFromPoints(quest)
    }
  }

  private async good(member: MemberId, guild: GuildId) {
    const data = this.getDataBasic(guild)
    if (data?.ready) {
      const userData = data.userData[member]
      const quest = userData.quests[0]
      quest.result = 'good'
      quest.endTime = Date.now()
      this.setFactionFromPoints(quest)
    }
  }
}

/** If an array is passed, a random value is used */
type Randomizable<T> = T | T[]

type RoleId = Discord.Role['id']
type GuildId = Discord.Guild['id']
type MemberId = Discord.GuildMember['id']
type UserId = Discord.User['id']
type ChannelID = Discord.Channel['id']

// !!! Use types in GuildData instead (this looks aids in hints)
type Question = Quest['questions'][number]
type Answer = Question['answers'][number] extends Randomizable<infer X> ? X : never
type Faction = (GuildData['factions'] extends undefined | infer X ? X : never)[string]
type UserData = GuildData['userData'][string]

type GuildData = ({
  ready: false
  /** The channel which the bot reads for commands */
  botChannels?: ChannelID
  /** The join role is removed if the user ends the quest in any way */
  joinRoles?: RoleId[]
  goodRoles?: RoleId[]
  badRoles?: RoleId[]
  /** The skip role is removed if the user finishes the quest */
  skipRoles?: RoleId[]
  factions?: {
    [name: string]: {
      roles?: RoleId[]
      points: number
      users: MemberId[]
    }
  }
  quest?: Quest
} | {
  ready: true
  /** The channel which the bot reads for commands */
  botChannels: ChannelID
  /** The join role is removed if the user ends the quest in any way */
  joinRoles: RoleId[]
  goodRoles: RoleId[]
  badRoles: RoleId[]
  /** The skip role is removed if the user finishes the quest */
  skipRoles: RoleId[]
  factions: {
    [name: string]: {
      roles: RoleId[]
      points: number
      users: MemberId[]
    }
  }
  quest: Quest
}) & {
  userData: {
    [memberId: string]: {
      quests: Array<{
        question: string
        result?: 'good' | 'bad' | 'skip'
        startTime: number
        endTime?: number
        attempts: number
        points?: {[faction: string]: number}
        faction?: string
      }>
    }
  }
}


interface Quest {
  /** Start question name */
  startQuestion: Randomizable<string>
  /** Message shown when the user reaches an invalid/missing question */
  deadEndMessage: Randomizable<string>
  /** Object of all the questions */
  questions: {
    [id: string]: {
      /** Shown text, array of strings for random starting quests */
      text: Randomizable<string>
      /** Array of answers with. Use arrays for randomized answers */
      answers: Array<Randomizable<{
        /** Shown text */
        text: string
        /** Next question id. 'good', 'bad', 'start' or 'skip' to run the respective function */
        target: Randomizable<string | string[] | 'good' | 'bad' | 'start' | 'skip'>
        /** Point values given */
        points?: {[faction: string]: Randomizable<number>}

        /** Shown when this answer is chosen */
        message?: Randomizable<string>
        /** Higher priority answers are shown first. Answers with same values have randomized order */
        priority?: string
        /** Manual prefix. Leave empty for automatic numbering. Note that this prefix (incasesensitive) has to be written by the user for it to be selected */
        prefix?: string
      }>>
    }
  }
}

interface GlobalQuestData {
  [member: string]: {
    activeGuild: string
  }
}
