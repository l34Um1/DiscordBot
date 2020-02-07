import Discord, { Client as DiscordClient } from 'discord.js'

import Commander from './commander'
import Data from './data'
import deepClone from './lib/deepClone'
import * as secretKey from './lib/secretKey'
import { onExit } from './lib/util'
import ParamValidator from './paramValidator'
import { getArgs } from './argRules'
import logger, { options as logOpts } from './logger'

export interface BotOptions {
  masters: readonly string[]
}

/**
 * Creates a fully operating bot  
 * Assuming you have set all the keys etc...  
 */
export default class Bot {
  private client: DiscordClient
  private data: Data
  private opts: Required<BotOptions>
  private commander: Commander
  private validator?: ParamValidator
  private args: ReturnType<typeof getArgs>

  constructor(options: BotOptions) {
    onExit(this.onExit.bind(this))

    this.args = getArgs()
    if (Array.isArray(this.args)) throw this.args

    if (this.args.args['preserve-log']) logOpts.noSave = true

    if (this.args.args.global) {
      const _global = global as any
      if (_global[this.args.args.global[0] || 'bot']) {
        throw new Error(`global[${this.args.args.global[0] || 'bot'}] is already defined, define a different value for --global`)
      } else {
        _global[this.args.args.global[0] || 'bot'] = this
      }
    }

    const joinMessage: {[channelId: number]: string} = {}
    if (this.args.args['join-message']) {
      for (const element of this.args.args['join-message']) {
        const split: string[] = element.split(/:/)
        joinMessage[~~split[0]] = split.slice(1).join(':').replace(/(?<!\\)_/g, ' ').replace(/\\_/g, '_')
      }
      console.warn('Process argument join-message is currently unsupported')
    }
    this.opts = {
      masters: [],
      ...deepClone(options),
    }

    const configPath = './cfg/keys.json'

    const token = secretKey.getKey(configPath, 'discord', 'token')
    if (typeof token !== 'string') throw new TypeError(`Provide a string value for discord.token ${configPath}`)


    this.client = new Discord.Client({})
    this.client.on('ready', () => console.log(`Logged in as ${this.client.user.tag}!`))
    this.client.on('message', msg => msg.content === 'ping' ? msg.reply('pong') : void 0)

    this.data = new Data(this.client, './data/', ['apiCache', 'apiUsers', 'clientData'])

    this.commander = new Commander(this.client, this.data, this.opts.masters)

    // Debug parameter validation
    // this.validator = new ParamValidator(this.commander, this.client)
    // this.validator.consoleInteract()

    this.commander.init().then((pluginIds) => {
      this.client.login(token)
      logger.info(`Instantiated plugins: ${pluginIds.join(', ')}`)
    })
  }

  private onExit(code: number) {
    if (this.data) this.data.saveAllSync()
  }
}
