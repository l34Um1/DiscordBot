import Discord, { TextChannel } from 'discord.js'

import prand from './lib/pseudoRandom'
import Data from './data'
import logger from './logger'
import RateLimiter from './lib/rateLimiter'

export default class EverythingHandler {
  private client: Discord.Client
  private data: Data
  private globalData!: GlobalQuestData
  private rl: RateLimiter
  constructor(client: Discord.Client, data: Data) {
    client.on('guildMemberAdd', this.onGuildMemberAdd.bind(this))
    client.on('message', this.onMessage.bind(this))

    this.client = client
    this.data = data
    this.rl = new RateLimiter({
      duration: 0,
      delay: 1000,
    })
    this.init()
  }

  private async init() {
    this.globalData = await this.data.load('global', 'questData', {}) as GlobalQuestData
  }

  private async onGuildMemberAdd(member: Discord.GuildMember) {
    const data = await this.getData(member.guild) as CombinedGuildData | undefined
    if (!data || data.userData[member.id]) return

    data.userData[member.id] = { quests: [] }
    if (data.joinRoles) this.addRoles(member, data.joinRoles)
    this.start(member)
  }

  private async onMessage(msg: Discord.Message) {
    logger.chat(`[${msg.channel.type}]>${msg.author.username ?? 'BOT'}: ${msg.content}`)
    if (msg.channel.type === 'dm') {
      const activeGuild = this.globalData[msg.author.id]?.activeGuild
      if (activeGuild) {
        const data = this.getDataBasic(activeGuild)
        if (data?.ready) {
          const question = data.quest.questions[data.userData[msg.author.id].quests[0].question]
          const answers = this.getSeededAnswers(msg.author.id, activeGuild, question.answers)
          if (!answers) return

          const prefixes = this.getSeededPrefixes(answers)
          const index = prefixes.indexOf(msg.content.toLowerCase())
          if (index !== -1) {
            this.advance(answers[index], msg.author.id, activeGuild)
          }
        }
      }
    } else if (msg.channel.type === 'text') {
      if (msg.content === '!save' && msg.member.hasPermission('ADMINISTRATOR')) {
        this.data.saveAllSync()
      }
      if (msg.content === '!exit' && msg.member.hasPermission('ADMINISTRATOR')) {
        process.exit()
      }

      const data = await this.getData(msg.guild)
      if (!data.ready) return
      if (data.botChannels.includes(msg.channel.id)) {
        let userData = data.userData[msg.member.id]
        if (userData) {
          if (msg.content === '!reset') {
            delete data.userData[msg.member.id]
            return
          }
        }
        if (!userData) {
          // Start quest if somehow never was caught with onGuildMemberAdd
          await this.onGuildMemberAdd(msg.member)
        } else if (userData.quests.length === 0) {
          // Start quest if somehow never started
          this.start(msg.member)
        }
        userData = data.userData[msg.member.id]
        if (userData) {
          if (userData.quests[0].question === data.quest.startQuestion) {
            const question = data.quest.questions[data.userData[msg.member.id].quests[0].question]
            const answers = this.getSeededAnswers(msg.member.id, msg.guild.id, question.answers)
            if (!answers) return

            const prefixes = this.getSeededPrefixes(answers)
            const index = prefixes.indexOf(msg.content.toLowerCase())
            if (index !== -1) {
              this.advance(answers[index], msg.member.id, msg.member.guild.id, msg.channel instanceof TextChannel ? msg.channel : undefined)
            }
          }
        }
      }
    }
  }

  private advance(answer: Answer, memberId: MemberId, guildId: GuildId, textChannel?: TextChannel) {
    const data = this.getDataBasic(guildId)
    if (data?.ready) {
      logger.botInfo(`Advancing quest for: ${memberId} in guild ${guildId}`)

      const quest = data.userData[memberId].quests[0]
      if (answer.points) {
        if (!quest.points) quest.points = {}
        for (const faction in answer.points) {
          quest.points[faction] = (quest.points[faction] ?? 0) + this.getRngVal(answer.points[faction])
        }
      }

      if (answer.reply) {
        if (answer.replyInGuildChannel && textChannel) {
          textChannel?.send(`${this.getRngVal(answer.reply)}\n\n`)
        } else {
          this.message(`${this.getRngVal(answer.reply)}\n\n`, memberId)
        }
      }
      if (answer.target === 'skip') {
        this.skip(memberId, guildId)
      } else if (answer.target === 'finish') {
        this.finish(memberId, guildId)
      } else {
        if (!answer.target) return
        quest.question = this.getRngVal(answer.target)
        this.displayQuestion(data.quest.questions[quest.question], memberId)
      }
    }
  }

  private async displayQuestion(question: Question, memberId: MemberId) {
    if (!this.globalData[memberId]) {
      logger.error(new Error('globalData[memberId] not defined'))
      return
    }

    const activeGuild = this.globalData[memberId].activeGuild

    const answers = this.getSeededAnswers(memberId, activeGuild, question.answers)
    if (!answers) return

    const prefixes = this.getSeededPrefixes(answers)
    const answersStrs = answers.map((v: typeof answers[number], i: number) => `${prefixes[i]}) ${v.text}`)

    this.message(`${this.getRngVal(question.text)}\n\n${answersStrs.join('\n\n')}\n\n`, memberId)
  }

  private async displayQuestionInChannel(question: Question, member: GuildMember, channel: TextChannel) {
    const answers = this.getSeededAnswers(member.id, member.guild.id, question.answers)
    if (!answers) return

    const prefixes = this.getSeededPrefixes(answers)
    const answersStrs = answers.map((v: typeof answers[number], i: number) => `${prefixes[i]}) ${v.text}`)

    channel.send(`<@${member.id}>${this.getRngVal(question.text)}\n\n${answersStrs.join('\n\n')}\n\n`)
  }

  private async message(msg: string, userId: UserId) {
    await (await this.client.fetchUser(userId, true)).send(msg)
  }

  /** Lowercase prefixes */
  private getSeededPrefixes(seededAnswers: Answer[]) {
    return seededAnswers.map((v, i) => v.prefix?.toLowerCase() || `${i + 1}`)
  }

  private getSeededAnswers(memberId: MemberId, guildId: GuildId, answers: Question['answers']) {
    const res: Answer[] = []
    const data = this.getDataBasic(guildId)
    if (!data) return
    for (const answer of answers) {
      if (Array.isArray(answer)) {
        const rand = Math.floor(prand(this.getPrandSeed(data.userData[memberId].quests[0].startTime, memberId), 0, answer.length + 0.999))
        res.push(answer[rand])
      } else {
        res.push(answer)
      }
    }
    return res
  }

  private addRoles(member: Discord.GuildMember | undefined, roles: string[]) {
    if (!member || !roles.length) return
    logger.apiDebug(`${member.guild.id} Adding roles (${roles.join(', ')}) for ${member.id}`)
    try {
      const preRoles = member.roles
      const filtered = roles.filter(v => !preRoles.has(v))
      if (roles.length) this.rl.queue(() => { member.addRoles(filtered); logger.apiDebug(`added (${filtered.join(', ')})`) })
    } catch (err) {
      logger.apiError(`${member.guild.id} Couldnt add roles (${roles.join(', ')}) for ${member.id}`)
    }
  }
  private removeRoles(member: Discord.GuildMember | undefined, roles: string[]) {
    if (!member || !roles.length) return
    logger.apiDebug(`${member.guild.id} Removing roles (${roles.join(', ')}) for ${member.id}`)
    try {
      const preRoles = member.roles
      const filtered = roles.filter(v => preRoles.has(v))
      if (roles.length) this.rl.queue(() => { member.removeRoles(filtered); logger.apiDebug(`removed (${filtered.join(', ')})`) })
    } catch (err) {
      logger.apiError(`${member.guild.id} Couldnt remove roles (${roles.join(', ')}) for ${member.id}`)
    }
  }

  /**
   * **If T is an array itself don't use this method!!**  
   * @returns If `randomizable` is an array, a random element in that array, otherwise, `randomizable` is returned
   */
  private getRngVal<T>(randomizable: Randomizable<T>): T extends any[] ? T[number] : T {
    return (Array.isArray(randomizable) ? randomizable[Math.random() * randomizable.length - 1] : randomizable) as T extends any[] ? T[number] : T
  }

  private getPrandSeed(startTime: number, memberId: MemberId) {
    return startTime + memberId
  }

  private async getData(guild: Discord.Guild): Promise<CombinedGuildData> {
    let guildData = this.data.getData(guild.id, 'guildData') as StaticGuildData | undefined
    let userData = this.data.getData(guild.id, 'guildUserData') as GuildUserData | undefined
    if (!guildData) {
      const channel = guild.channels.first()
      const defaults: StaticGuildData = { ...channel ? { botChannels: [channel.id] } : {}, ...{ ready: false, userData: {} } }
      guildData = await this.data.load(guild.id, 'guildData', defaults) as StaticGuildData | undefined
    }
    if (!userData) {
      userData = await this.data.load(guild.id, 'guildUserData', {}) as GuildUserData | undefined
    }
    if (!guildData || !userData) throw new Error('Didnt load eShrug')
    return { userData, ...guildData }
  }
  private getDataBasic(guildId: GuildId): CombinedGuildData | undefined {
    const guildData = this.data.getData(guildId, 'guildData') as StaticGuildData | undefined
    const userData = this.data.getData(guildId, 'guildUserData') as GuildUserData | undefined
    if (!guildData || !userData) return
    return { userData, ...guildData }
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

  private getFactionRoles(factions: StaticGuildData['factions']) {
    const res = []
    for (const faction in factions) res.push(factions[faction].role)
    return res
  }

  private validate() {
    return true
  }

  private async start(member: GuildMember) {
    const memberId = member.id
    const guild = member.guild
    const guildId = guild.id

    logger.botInfo(`Starting quest for: ${memberId} in guild ${guildId}`)

    this.globalData[memberId] = { activeGuild: guildId }

    const data = this.getDataBasic(guildId)
    if (data?.ready) {
      const userData = data.userData[memberId]
      if (userData.quests.length === 0 || userData.quests[0].endTime) {
        userData.quests.push({ question: this.getRngVal(data.quest.startQuestion), startTime: Date.now(), attempts: 1 })
      } else {
        const quest = userData.quests[0]
        quest.attempts++
        quest.question = this.getRngVal(data.quest.startQuestion)
        quest.startTime = Date.now()
        delete quest.points
      }
      userData.quests[0].startTime = Date.now()

      this.addRoles(member, data.questingRoles)

      const channel = guild.defaultChannel ?? guild.channels.find('id', data.botChannels[0])
      const question = this.getRngVal(data.quest.questions[this.getRngVal(data.quest.startQuestion)])

      this.displayQuestionInChannel(question, member, channel)
    }
  }

  private async skip(memberId: MemberId, guildId: GuildId) {
    logger.botInfo(`Skipped quest for: ${memberId} in guild ${guildId}`)

    const data = this.getDataBasic(guildId)
    if (data?.ready) {
      const userData = data.userData[memberId]
      const quest = userData.quests[0]
      quest.result = 'skip'
      quest.endTime = Date.now()
      delete this.globalData[memberId]


      const member = this.client.guilds.get(guildId)?.member(memberId)

      this.removeRoles(member, [...data.questingRoles, ...data.joinRoles])

      if (userData.quests.every(v => !v.result || v.result === 'skip')) this.addRoles(member, data.skipRoles)
    }
  }

  private async finish(memberId: MemberId, guildId: GuildId) {
    logger.botInfo(`Finished quest for: ${memberId} in guild ${guildId}`)

    const data = this.getDataBasic(guildId)
    if (data?.ready) {
      const userData = data.userData[memberId]
      const quest = userData.quests[0]
      quest.result = 'finish'
      quest.endTime = Date.now()
      this.setFactionFromPoints(quest)
      delete this.globalData[memberId]

      const member = this.client.guilds.get(guildId)?.member(memberId)
      const factionRoles = this.getFactionRoles(data.factions)

      this.removeRoles(member, [...factionRoles, ...data.questingRoles, ...data.skipRoles, ...data.joinRoles])

      if (quest.faction) this.addRoles(member, [data.factions[quest.faction].role])
      this.addRoles(member, data.finishRoles)
    }
  }
}
