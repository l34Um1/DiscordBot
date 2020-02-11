import Discord, { TextChannel } from 'discord.js'

import prand from './lib/pseudoRandom'
import Data from './data'
import logger from './logger'
import RateLimiter from './lib/rateLimiter'
import deepClone from './lib/deepClone'

export default class EverythingHandler {
  private client: Discord.Client
  private data: Data
  private globalData!: GlobalQuestData
  private rl: RateLimiter
  private commandKeys: { [guild: string]: { [command: string]: CommandData['commands'][number] } }
  constructor(client: Discord.Client, data: Data) {
    this.client = client
    this.data = data
    this.rl = new RateLimiter({
      duration: 0,
      delay: 1000,
    })
    this.commandKeys = {}
    this.init()
  }

  private async init() {
    this.globalData = await this.data.load<GlobalQuestData>('global', 'questData', {})

    this.client.on('guildMemberAdd', this.onGuildMemberAdd.bind(this))
    this.client.on('message', this.onMessage.bind(this))
    this.client.on('guildCreate', this.onGuildAdd.bind(this))
  }

  private async onGuildMemberAdd(member: Discord.GuildMember) {
    const d = await this.getData(member.guild) as CombinedGuildData | undefined
    if (!d || d.user[member.id]) return

    d.user[member.id] = { quests: [] }
    if (d.guild.joinRoles) this.editRoles(member, [], d.guild.joinRoles)
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
        const role = this.getDataBasic(guild.id)?.guild.factions[faction].role
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
    if (!msg.member) return
    if (msg.author.id === this.client.user.id) {
      logger.botChat(`[${msg.channel.type}]>BOT: ${msg.content}`)
      return
    }
    logger.chat(`[${msg.channel.type}]>${msg.author.username}: ${msg.content}`)
    if (msg.channel.type === 'dm') {
      const activeGuild = this.globalData[msg.author.id]?.activeGuild
      if (activeGuild) {
        const d = this.getDataBasic(activeGuild)
        if (d) {
          try {
            const question = d.guild.quest.questions[d.user[msg.author.id].quests[0].question]
            const answers = this.getSeededAnswers(msg.author.id, activeGuild, question.answers)
            if (!answers) return

            const prefixes = this.getSeededPrefixes(answers)
            const index = prefixes.indexOf(msg.content.toLowerCase())
            if (index !== -1) {
              await this.advance(answers[index], msg.author.id, activeGuild)
            }
          } catch (err) {
            logger.error(err)
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
          process.send?.({ cmd: 'AUTO_RESTART', val: false })
          process.exit()
        }
        if (msg.content === '!reset') {
          commandUsed = true

          const d = await this.getData(msg.guild)
          if (!d) return
          delete d.user[msg.member.id]
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
          this.updateCommandKeys(msg.guild.id, cmdData.commands)
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
          this.updateCommandKeys(msg.guild.id, cmdData.commands)
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
            msg.channel.send('Command does not exist. Note that hardcoded aliases cannot be edited')
            return
          }
          delete cmdData.commands[name]
          this.updateCommandKeys(msg.guild.id, cmdData.commands)
          msg.channel.send('Command deleted')
        }
      }

      const cmdKeys = this.getCommandKeys(msg.guild.id)
      if (cmdKeys) {
        const input = msg.content.toLowerCase()
        if (cmdKeys[input]) {
          msg.channel.send(cmdKeys[input].text)
          return
        }
      }

      const d = await this.getData(msg.guild)
      if (!d) return

      let userData = d.user[msg.member.id]
      if (userData) {
        if (msg.content === '!quiz') {
          const quests = userData.quests
          commandUsed = true
          if (quests.length) {
            const quest = quests[quests.length - 1]
            if (quest) {
              if (quest.result === 'skip') {
                quests.pop()
              } else if (quest.result === 'finish') {
                msg.channel.send('You already did the quest')
              } else {
                msg.channel.send('You are already in the process of doing the quest. Try typing 1 in #welcome')
              }
            }
          } else {
            delete d.user[msg.member.id]
          }
        }
      }
      if (maybeCommand && !commandUsed) msg.channel.send('Hm... I\'m not familiar with that. Try something else.')

      // If in main channel (#welcome)
      if (d.guild.botChannels.includes(msg.channel.id)) {
        if (!userData) {
          // Start quest if somehow never was caught with onGuildMemberAdd
          this.onGuildMemberAdd(msg.member)
          return
        } else if (userData.quests.length === 0) {
          // Start quest if somehow never started
          this.start(msg.member)
        }
        userData = d.user[msg.member.id]
        if (userData) {
          if (userData.quests[0].question === d.guild.quest.startQuestion) {
            const question = d.guild.quest.questions[d.user[msg.member.id].quests[0].question]
            const answers = this.getSeededAnswers(msg.member.id, msg.guild.id, question.answers)
            if (!answers) return

            const prefixes = this.getSeededPrefixes(answers)
            const index = prefixes.indexOf(msg.content.toLowerCase())
            if (index !== -1) {
              await this.advance(answers[index], msg.member.id, msg.member.guild.id, msg.channel instanceof TextChannel ? msg.channel : undefined)
            }
          }
        }
      }
    }
  }
  private getCommandKeys(guildId: string): EverythingHandler['commandKeys'][string] | undefined {
    return this.commandKeys[guildId]
  }

  private updateCommandKeys(guildId: string, commands: CommandData['commands']) {
    this.commandKeys[guildId] = {}

    const cmdKeys = this.commandKeys[guildId]

    for (const commandKey in commands) {
      const command = commands[commandKey]
      cmdKeys[commandKey.toLowerCase()] = command
      if (command.alias) {
        for (const alias of command.alias) {
          cmdKeys[alias.toLowerCase()] = command
        }
      }
    }
  }

  private async advance(answer: Answer, memberId: MemberId, guildId: GuildId, textChannel?: TextChannel) {
    const data = this.getDataBasic(guildId)
    if (data) {
      logger.botInfo(`Advancing quest for: ${memberId} in guild ${guildId}`)

      const quest = data.user[memberId].quests[data.user[memberId].quests.length - 1]
      const oldQuest = deepClone(quest)
      if (answer.points) {
        if (!quest.points) quest.points = {}
        for (const faction in answer.points) {
          quest.points[faction] = (quest.points[faction] ?? 0) + this.getRngVal(answer.points[faction])
        }
      }

      if (answer.reply) {
        if (answer.replyInGuildChannel && textChannel) {
          textChannel.send(`${this.getRngVal(answer.reply)}\n\n`)
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
        try {
          await this.displayQuestion(data.guild.quest.questions[quest.question], memberId)
        } catch (err) {
          data.user[memberId].quests[data.user[memberId].quests.length - 1] = oldQuest
          if (textChannel) {
            textChannel.send(`<@${memberId}> I couldn't send you a response. Make sure you have whispers enabled from server members! (settings -> Privacy&Safety -> Allow direct...)`)
          }
        }
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

    await this.whisper(`${this.getRngVal(question.text)}\n\n${answersStrs.join('\n\n')}\n\n`, memberId)
  }

  private async displayQuestionInChannel(question: Question, member: GuildMember, channel: TextChannel) {
    const answers = this.getSeededAnswers(member.id, member.guild.id, question.answers)
    if (!answers) return

    const prefixes = this.getSeededPrefixes(answers)
    const answersStrs = answers.map((v: typeof answers[number], i: number) => `${prefixes[i]}) ${v.text}`)

    channel.send(`<@${member.id}> ${this.getRngVal(question.text)}\n\n${answersStrs.join('\n\n')}\n\n`)
  }

  private async whisper(msg: string, userId: UserId) {
    return (await this.client.fetchUser(userId, true)).send(msg)
  }

  /** Lowercase prefixes */
  private getSeededPrefixes(seededAnswers: Answer[]) {
    return seededAnswers.map((v, i) => v.prefix?.toLowerCase() || `${i + 1}`)
  }

  private getSeededAnswers(memberId: MemberId, guildId: GuildId, answers: Question['answers']) {
    const res: Answer[] = []
    const d = this.getDataBasic(guildId)
    if (!d) return
    for (const answer of answers) {
      if (Array.isArray(answer)) {
        const rand = Math.floor(prand(this.getPrandSeed(d.user[memberId].quests[0].startTime, memberId), 0, answer.length + 0.999))
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
    let guildData = this.data.getData<GuildData>(guild.id, 'guildData')
    let userData = this.data.getData<GuildUserData>(guild.id, 'guildUserData')
    let dynData = this.data.getData<GuildDynamicData>(guild.id, 'guildDynamicData')
    if (guildData && userData && dynData) return { user: userData, guild: guildData, dyn: dynData }

    const promises: Array<Promise<any>> = []
    if (!guildData) promises.push(this.data.load<GuildData>(guild.id, 'guildData'))
    if (!userData) promises.push(this.data.load<GuildUserData>(guild.id, 'guildUserData', {}))
    if (!dynData) promises.push(this.data.load<GuildDynamicData>(guild.id, 'guildDynamicData', { reorderTime: 0 }))
    await Promise.all(promises)

    guildData = this.data.getData<GuildData>(guild.id, 'guildData')
    userData = this.data.getData<GuildUserData>(guild.id, 'guildUserData')
    dynData = this.data.getData<GuildDynamicData>(guild.id, 'guildDynamicData')

    if (!guildData || !userData || !dynData) throw new Error('Didnt load eShrug')
    return { user: userData, guild: guildData, dyn: dynData }
  }
  private getDataBasic(guildId: GuildId): CombinedGuildData | undefined {
    const guildData = this.data.getData<GuildData>(guildId, 'guildData')
    const userData = this.data.getData<GuildUserData>(guildId, 'guildUserData')
    const dynData = this.data.getData<GuildDynamicData>(guildId, 'guildDynamicData')
    if (!guildData || !userData || !dynData) return
    return { user: userData, guild: guildData, dyn: dynData }
  }

  private async getCommandData(guild: Discord.Guild): Promise<CommandData> {
    let cmdData = this.data.getData<CommandData>(guild.id, 'commandData')
    if (!cmdData) {
      cmdData = await this.data.load<CommandData>(guild.id, 'commandData', { commands: {} })
      if (cmdData) this.updateCommandKeys(guild.id, cmdData.commands)
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
      const rareFactionPoints: { [faction: string]: number } = {}
      const staticData = this.data.getData<FactionData>(guildId, 'factionData')
      if (staticData) {
        const populations: { [faction: string]: number } = {}
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

  private getFactionRoles(factions: GuildData['factions']) {
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
      const userData = data.user[memberId]
      if (userData.quests.length === 0 || userData.quests[0].endTime) {
        userData.quests.push({ question: this.getRngVal(data.guild.quest.startQuestion), startTime: Date.now(), attempts: 1 })
      } else {
        const quest = userData.quests[0]
        quest.attempts++
        quest.question = this.getRngVal(data.guild.quest.startQuestion)
        quest.startTime = Date.now()
        delete quest.points
      }
      userData.quests[0].startTime = Date.now()

      this.editRoles(member, [], data.guild.questingRoles)

      const channel = guild.channels.find('id', data.guild.botChannels[0])
      if (!(channel instanceof TextChannel)) {
        logger.warn('No suitable channel found for channel answer')
        return
      }

      const question = this.getRngVal(data.guild.quest.questions[this.getRngVal(data.guild.quest.startQuestion)])

      this.displayQuestionInChannel(question, member, channel)
    }
  }

  private async skip(memberId: MemberId, guildId: GuildId) {
    logger.botInfo(`Skipped quest for: ${memberId} in guild ${guildId}`)

    const d = this.getDataBasic(guildId)
    if (d) {
      const userData = d.user[memberId]
      const quest = userData.quests[0]
      quest.result = 'skip'
      quest.endTime = Date.now()
      delete this.globalData[memberId]


      const member = this.client.guilds.get(guildId)?.member(memberId)

      let remove: string[] = []
      let add: string[] = []
      remove = [...d.guild.questingRoles, ...d.guild.joinRoles]

      if (userData.quests.every(v => !v.result || v.result === 'skip')) add = d.guild.skipRoles

      this.editRoles(member, remove, add)
    }
  }

  private async finish(memberId: MemberId, guildId: GuildId) {
    logger.botInfo(`Finished quest for: ${memberId} in guild ${guildId}`)

    const d = this.getDataBasic(guildId)
    if (d) {
      const userData = d.user[memberId]
      const quest = userData.quests[0]
      quest.result = 'finish'
      quest.endTime = Date.now()

      const fact = this.setFactionFromPoints(quest, guildId)
      delete this.globalData[memberId]

      const member = this.client.guilds.get(guildId)?.member(memberId)
      const factionRoles = this.getFactionRoles(d.guild.factions)

      const remove: string[] = [...factionRoles, ...d.guild.questingRoles, ...d.guild.skipRoles, ...d.guild.joinRoles]
      const add: string[] = []

      if (quest.faction) add.push(d.guild.factions[quest.faction].role)
      add.concat(d.guild.finishRoles)

      this.editRoles(member, remove, add)

      const faction: Faction = d.guild.factions[fact || '']
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
