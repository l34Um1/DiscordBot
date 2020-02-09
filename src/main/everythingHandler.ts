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
    this.client = client
    this.data = data
    this.rl = new RateLimiter({
      duration: 0,
      delay: 1000,
    })
    this.init()
  }

  private async init() {
    this.globalData = await this.data.load<GlobalQuestData>('global', 'questData', {})

    this.client.on('guildMemberAdd', this.onGuildMemberAdd.bind(this))
    this.client.on('message', this.onMessage.bind(this))
    this.client.on('guildCreate', this.onGuildAdd.bind(this))
  }

  private async onGuildMemberAdd(member: Discord.GuildMember) {
    const data = await this.getData(member.guild) as CombinedGuildData | undefined
    if (!data || data.userData[member.id]) return

    data.userData[member.id] = { quests: [] }
    if (data.joinRoles) this.editRoles(member, [], data.joinRoles)
    this.start(member)
  }

  private async onGuildAdd(guild: Guild) {
    const func = () => {
      if (!guild.available) {
        clearInterval(interval)
        return
      }

      const staticData = this.data.getData<FactionData>(guild.id, 'factionData')
      if (!staticData) return
      for (const faction in staticData.factions) {
        const role = this.getDataBasic(guild.id)?.factions[faction].role
        if (!role) continue

        const count = guild.roles.get(role)?.members.size
        if (typeof count === 'undefined') continue
        staticData.factions[faction].count = count
      }
    }
    func()

    const interval = setInterval(func, 60 * 60 * 1000)
  }

  private async onMessage(msg: Discord.Message) {
    if (msg.author.id === this.client.user.id) {
      logger.botChat(`[${msg.channel.type}]>BOT: ${msg.content}`)
      return
    }
    logger.chat(`[${msg.channel.type}]>${msg.author.username}: ${msg.content}`)
    if (msg.channel.type === 'dm') {
      const activeGuild = this.globalData[msg.author.id]?.activeGuild
      if (activeGuild) {
        const data = this.getDataBasic(activeGuild)
        if (data) {
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
      const words = msg.content.split(' ')
      const maybeCommand = Boolean(words[0].match(/^!\S/))
      let commandUsed = false
      const cmdData = await this.getCommandData(msg.guild)
      if (msg.member.hasPermission('ADMINISTRATOR')) {
        if (msg.content === '!save') {
          commandUsed = true
          this.data.saveAllSync()
          return
        }
        if (msg.content === '!exit') {
          commandUsed = true
          process.exit()
        }
        if (msg.content === '!reset') {
          commandUsed = true

          const data = await this.getData(msg.guild)
          if (!data) return
          delete data.userData[msg.member.id]
          return
        }
        if (msg.content.startsWith('!addcom')) {
          commandUsed = true
          if (!msg.content.match(/^[^ ]+ [^ ]+ [^ ].*/)) {
            msg.channel.send('Invalid format. Format is: "!addcom {command name} {response text}"')
            return
          }

          const name = words[1]
          const text = words.slice(2).join(' ')
          if (!cmdData) {
            msg.channel.send('Data is not available. Try again later')
            return
          }
          if (cmdData.commands[name]) {
            msg.channel.send('Command already exists. Use !editcom if you intended to edit it')
            return
          }
          cmdData.commands[name] = { text }
          msg.channel.send('Command created')
        }
        if (msg.content.startsWith('!editcom')) {
          commandUsed = true
          if (!msg.content.match(/^[^ ]+ [^ ]+ [^ ].*/)) {
            msg.channel.send('Invalid format. Format is: "!editcom {command name} {response text}"')
            return
          }

          const name = words[1]
          const text = words.slice(2).join(' ')
          if (!cmdData) {
            msg.channel.send('Data is not available. Try again later')
            return
          }
          if (!cmdData.commands[name]) {
            msg.channel.send('Command does not exist. Creating as a new command')
          }
          cmdData.commands[name] = { text }
          msg.channel.send('Command modified')
        }
        if (msg.content.startsWith('!delcom')) {
          commandUsed = true
          if (!msg.content.match(/^[^ ]+ [^ ]/)) {
            msg.channel.send('Invalid format. Format is: "!delcom {command name}"')
            return
          }

          const name = words[1]
          if (!cmdData) {
            msg.channel.send('Data is not available. Try again later')
            return
          }
          if (!cmdData.commands[name]) {
            msg.channel.send('Command does not exist')
            return
          }
          delete cmdData.commands[name]
          msg.channel.send('Command deleted')
        }
      }
      if (cmdData?.commands[words[0]]) {
        msg.channel.send(cmdData.commands[words[0]].text)
        return
      }

      const data = await this.getData(msg.guild)
      if (!data) return
      if (data.botChannels.includes(msg.channel.id)) {
        let userData = data.userData[msg.member.id]
        if (userData) {
          if (msg.content === '!quiz') {
            const quests = userData.quests
            commandUsed = true
            if (userData.quests.length) {
              const quest = quests[userData.quests.length - 1]
              if (quest) {
                if (quest.result === 'skip') {
                  quests.pop()
                } else if (quest.result === 'finish') {
                  msg.channel.send('You already did the quest')
                } else {
                  msg.channel.send('You are already in the process of doing the quest')
                }
              }
            } else {
              delete data.userData[msg.member.id]
            }
          }
        }
        if (maybeCommand && !commandUsed) msg.channel.send('Hm... I\'m not familiar with that. Try something else.')
        if (!userData) {
          // Start quest if somehow never was caught with onGuildMemberAdd
          this.onGuildMemberAdd(msg.member)
          return
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
    if (data) {
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
          this.whisper(`${this.getRngVal(answer.reply)}\n\n`, memberId)
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

    this.whisper(`${this.getRngVal(question.text)}\n\n${answersStrs.join('\n\n')}\n\n`, memberId)
  }

  private async displayQuestionInChannel(question: Question, member: GuildMember, channel: TextChannel) {
    const answers = this.getSeededAnswers(member.id, member.guild.id, question.answers)
    if (!answers) return

    const prefixes = this.getSeededPrefixes(answers)
    const answersStrs = answers.map((v: typeof answers[number], i: number) => `${prefixes[i]}) ${v.text}`)

    channel.send(`<@${member.id}>${this.getRngVal(question.text)}\n\n${answersStrs.join('\n\n')}\n\n`)
  }

  private async whisper(msg: string, userId: UserId) {
    try {
      await (await this.client.fetchUser(userId, true)).send(msg)
    } catch (err) {
      logger.error(err)
    }
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

  private editRoles(member: Discord.GuildMember | undefined, remove: string[], add: string[]) {
    if (!member || !(add.length + remove.length)) return
    logger.apiDebug(`${member.guild.name} Editing roles of ${member.displayName} (removing: ${remove.join()}, adding ${add.join()})`)

    const original = member.roles
    const roles = original.filter(v => !remove.includes(v.id)).map(v => v.id)
    for (const role of add) {
      if (roles.includes(role)) continue
      roles.push(role)
    }

    member.setRoles(roles)
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
    let guildData = this.data.getData<StaticData>(guild.id, 'guildData')
    let userData = this.data.getData<GuildUserData>(guild.id, 'guildUserData')
    if (!guildData) {
      guildData = await this.data.load<StaticData>(guild.id, 'guildData')
    }
    if (!userData) {
      userData = await this.data.load<GuildUserData>(guild.id, 'guildUserData', {})
    }
    if (!guildData || !userData) throw new Error('Didnt load eShrug')
    return { userData, ...guildData }
  }
  private getDataBasic(guildId: GuildId): CombinedGuildData | undefined {
    const guildData = this.data.getData<StaticData>(guildId, 'guildData')
    const userData = this.data.getData<GuildUserData>(guildId, 'guildUserData')
    if (!guildData || !userData) return
    return { userData, ...guildData }
  }

  private async getCommandData(guild: Discord.Guild): Promise<CommandData> {
    let cmdData = this.data.getData<CommandData>(guild.id, 'commandData')
    if (!cmdData) {
      cmdData = await this.data.load<CommandData>(guild.id, 'commandData', { commands: {} })
    }
    return cmdData
  }

  private async updateStaticData(guildId: string, quest: UserData['quests'][number]) {
    let staticData = this.data.getData<FactionData>(guildId, 'factionData')
    if (!staticData) {
      staticData = await this.data.load<FactionData>(guildId, 'factionData', { factions: {} })
    }
    if (quest.points) {
      for (const faction in quest.points) {
        if (!staticData.factions[faction]) {
          staticData.factions[faction] = { points: 0, count: 0, questPoints: 0 }
        }
        staticData.factions[faction].questPoints += quest.points[faction]
      }
    }
    if (quest.faction) {
      if (!staticData.factions[quest.faction]) {
        staticData.factions[quest.faction] = { points: 0, count: 0, questPoints: 0 }
      }
      staticData.factions[quest.faction].count++
    }
  }

  private setFactionFromPoints(quest: UserData['quests'][number], guildId: string): string | undefined {
    const rangePercent = 0.2
    if (!quest.points) return quest.faction

    const points = quest.points
    if (points) {
      const maxRarePoints = 5
      const rareFactionPoints: {[faction: string]: number} = {}
      const staticData = this.data.getData<FactionData>(guildId, 'factionData')
      if (staticData) {
        const populations: {[faction: string]: number} = {}
        let population = 0

        for (const faction in staticData.factions) {
          populations[faction] = staticData.factions[faction].count
          population += staticData.factions[faction].count
        }

        const evenSpreadPopulation = population / Object.keys(staticData.factions).length

        for (const faction in staticData.factions) {
          rareFactionPoints[faction] = (1 - Math.max(staticData.factions[faction].count / evenSpreadPopulation, 1)) * maxRarePoints
        }
      }


      let maxPoints = -Infinity
      let maxFact = ''
      for (const faction in points) {
        if (points[faction] > maxPoints) {
          const raredPoints = points[faction] + rareFactionPoints[faction]
          maxPoints = raredPoints
          maxFact = faction
        }
      }

      let minInRangePoints = Infinity
      let minInRange = maxFact
      for (const faction in points) {
        const raredPoints = points[faction] + rareFactionPoints[faction]
        if ((1 - raredPoints / maxPoints) <= rangePercent) {
          if (raredPoints < minInRangePoints) {
            minInRangePoints = raredPoints
            minInRange = faction
          }
        }
      }

      quest.faction = minInRange ?? maxFact
    }
    return quest.faction
  }

  private getFactionRoles(factions: StaticData['factions']) {
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
    if (data) {
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

      this.editRoles(member, [], data.questingRoles)

      const channel = guild.channels.find('id', data.botChannels[0])
      if (!(channel instanceof TextChannel)) {
        logger.warn('No suitable channel found for channel answer')
        return
      }

      const question = this.getRngVal(data.quest.questions[this.getRngVal(data.quest.startQuestion)])

      this.displayQuestionInChannel(question, member, channel)
    }
  }

  private async skip(memberId: MemberId, guildId: GuildId) {
    logger.botInfo(`Skipped quest for: ${memberId} in guild ${guildId}`)

    const data = this.getDataBasic(guildId)
    if (data) {
      const userData = data.userData[memberId]
      const quest = userData.quests[0]
      quest.result = 'skip'
      quest.endTime = Date.now()
      delete this.globalData[memberId]


      const member = this.client.guilds.get(guildId)?.member(memberId)

      let remove: string[] = []
      let add: string[] = []
      remove = [...data.questingRoles, ...data.joinRoles]

      if (userData.quests.every(v => !v.result || v.result === 'skip')) add = data.skipRoles

      this.editRoles(member, remove, add)
    }
  }

  private async finish(memberId: MemberId, guildId: GuildId) {
    logger.botInfo(`Finished quest for: ${memberId} in guild ${guildId}`)

    const data = this.getDataBasic(guildId)
    if (data) {
      const userData = data.userData[memberId]
      const quest = userData.quests[0]
      quest.result = 'finish'
      quest.endTime = Date.now()

      const fact = this.setFactionFromPoints(quest, guildId)
      delete this.globalData[memberId]

      const member = this.client.guilds.get(guildId)?.member(memberId)
      const factionRoles = this.getFactionRoles(data.factions)

      const remove: string[] = [...factionRoles, ...data.questingRoles, ...data.skipRoles, ...data.joinRoles]
      const add: string[] = []

      if (quest.faction) add.push(data.factions[quest.faction].role)
      add.concat(data.finishRoles)

      this.editRoles(member, remove, add)

      const faction: Faction = data.factions[fact || '']
      if (fact && faction) {
        if (fact && faction.confirmationMessage) {
          this.whisper(faction.confirmationMessage, memberId)
        }

        if (fact && faction.newcomerMessage && faction.mainChannel) {
          const guild = this.client.guilds.get(guildId)
          const channel = guild?.channels.get(faction.mainChannel)

          if (channel instanceof TextChannel) {
            channel.send(faction.newcomerMessage)
          }
        }
      }

      await this.updateStaticData(guildId, quest)
    }
  }
}
