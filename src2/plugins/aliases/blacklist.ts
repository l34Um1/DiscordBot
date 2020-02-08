import { Guild, GuildMember } from 'discord.js'

import { Extra, PluginInstance, PluginOptions, Userlvl } from '../../main/commander'
import PluginLibrary from '../../main/pluginLib'

const exp: Array<{ options: PluginOptions, Instance: any }> = [
  {
    options: {
      type: 'command',
      id: 'blacklist',
      title: 'Blacklist',
      description: 'Forbids a user from using a command',
      default: {
        alias: ['!blacklist'],
        options: {
          userlvl: Userlvl.admin,
        },
      },
      help: ['Forbid user from using command: {alias} <user> <command>'],
    },

    Instance: class implements PluginInstance {
      public handlers: PluginInstance['handlers']
      private l: PluginLibrary

      constructor(pluginLib: PluginLibrary) {
        this.l = pluginLib

        this.handlers = this.l.addHandlers(this, this.handlers, 'default', '<USER> <COMMAND>', this.callMain)
      }

      private async callMain(guild: Guild, member: GuildMember, params: any, extra: Extra) {
        const [target, aliasName]: [GuildMember, string] = params

        const alias = this.l.getAlias(guild, aliasName)
        if (alias) { // Channel alias
          if (!this.l.isPermitted(alias, member, { ignoreWhiteList: true })) return 'You cannot edit the blacklist of a command you are not permitted to use'

          if (this.l.isOwner(member)) return 'You cannot blacklist the broadcaster'
          if (this.l.isAdmin(member)) return 'You cannot blacklist an administrator'

          if (alias.blacklist && alias.blacklist.includes(target.id)) return `${extra.words[2]} is already blacklisted from using ${aliasName}`

          let out: string[] = []
          if (alias.blacklist) out = [...alias.blacklist]
          out.push(target.id)
          this.l.modAlias(guild, aliasName, { blacklist: out })
          return `Blacklisted ${extra.words[1]} from using ${aliasName}`
        }
        return 'Cannot find that command'
      }
    },
  },

  {
    options: {
      type: 'command',
      id: 'unblacklist',
      title: 'Unblacklist',
      description: 'Removes a user from a command\'s blacklist',
      default: {
        alias: ['?unblacklist'],
        options: {
          userlvl: Userlvl.admin,
        },
      },
      help: ['Remove user from the blacklist of command: {alias} <user> <command>'],
    },

    Instance: class implements PluginInstance {
      public handlers: PluginInstance['handlers']
      private l: PluginLibrary

      constructor(pluginLib: PluginLibrary) {
        this.l = pluginLib

        this.handlers = this.l.addHandlers(this, this.handlers, 'default', '<USER> <COMMAND>', this.callMain)
      }

      public async callMain((guild: Guild, member: GuildMember, params: any, extra: Extra), extra: Extra) {
        const [targetId, aliasName]: [number, string] = params

        const alias = this.l.getAlias(channelId, aliasName)
        if (alias) { // Channel alias
          if (!this.l.isPermitted(alias, userId, extra.irc.tags.badges, { ignoreWhiteList: true })) return 'You cannot edit the blacklist of a command you are not permitted to use'

          if (!alias.blacklist || !alias.blacklist.includes(targetId)) return `${extra.words[1]} is not blacklisted from using ${aliasName}`
          this.l.modAlias(channelId, aliasName, { blacklist: alias.blacklist.filter(v => v !== targetId) })
          return `Removed ${extra.words[1]} from ${aliasName}'s blacklist`
        }
        return 'Cannot find that command'
      }
    },
  },
]

module.exports = exp
