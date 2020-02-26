
import Data from './data'
import deepClone from './lib/deepClone'
import * as secretKey from './lib/secretKey'
import { onExit } from './lib/util'
import ParamValidator from './paramValidator'
import { getArgs } from './argRules'
import logger, { options as logOpts } from './logger'
import EverythingHandler from './everythingHandler'

import Discord from 'discord.js'

export interface BotOptions {
  masters: readonly number[]
}

export default class Bot {
  private data: Data
  private opts: Required<BotOptions>
  private client: Discord.Client
  private validator?: ParamValidator
  private args: ReturnType<typeof getArgs>
  private handler: EverythingHandler

  constructor(options: BotOptions) {
    onExit(this.onExit.bind(this))

    this.args = getArgs()
    if (Array.isArray(this.args)) throw this.args

    if (this.args.args['preserve-log']) logOpts.noSave = true

    const joinMessage: {[channelId: number]: string} = {}
    if (this.args.args.global) {
      const _global = global as any
      if (_global[this.args.args.global[0] || 'bot']) {
        throw new Error(`global[${this.args.args.global[0] || 'bot'}] is already defined, define a different value for --global`)
      } else {
        _global[this.args.args.global[0] || 'bot'] = this
      }
    }

    this.opts = {
      masters: [],
      ...deepClone(options),
    }

    const configPath = './cfg/keys.json'

    const token = secretKey.getKey(configPath, 'discord', 'token')
    if (typeof token !== 'string') {
      throw new TypeError(`Provide a string value for discord.token ${configPath}`)
    }


    this.client = new Discord.Client({})

    this.client.on('ready', () => console.log(`Logged in as ${this.client.user.tag}!`))
    this.client.on('message', msg => msg.content === 'ping' ? msg.reply('pong') : void 0)

    this.client.login(token)

    this.data = new Data('./data/', ['apiCache', 'apiUsers', 'clientData'])

    this.handler = new EverythingHandler(this.client, this.data)

    // Debug parameter validation
    // this.validator = new ParamValidator(this.commander, this.client)
    // this.validator.consoleInteract()
  }

  private onExit(code: number) {
    if (this.data) this.data.saveAllSync()
  }
}
