
// ---------------------- //
// Faction bot stuff here //
// ---------------------- //

type Role = import('discord.js').Role;
type Guild = import('discord.js').Guild
type GuildMember = import('discord.js').GuildMember
type User = import('discord.js').User
type Channel = import('discord.js').Channel

/** If an array is passed, a random value is used */
type Randomizable<T> = T | T[]

type RoleId = Role['id']
type GuildId = Guild['id']
type MemberId = GuildMember['id']
type UserId = User['id']
type ChannelID = Channel['id']

// !!! Use types in GuildData instead (this looks aids in hints)
type Question = Quest['questions'][number]
type Answer = Question['answers'][number] extends Randomizable<infer X> ? X : never
type Faction = (GuildData['factions'] extends undefined | infer X ? X : never)[string]
type UserData = GuildUserData[string]

// ----------------------- //
// customizable data stuff //
// ----------------------- //

type CombinedGuildData = {
  user: GuildUserData
  dyn: GuildDynamicData
  guild: GuildData
}

interface GuildDynamicData {
  reorderTime: number
}

interface GuildUserData {
  [memberId: string]: {
    quests: Array<{
      question: string
      result?: 'finish' | 'skip'
      startTime: number
      endTime?: number
      attempts: number
      points?: {[faction: string]: number}
      faction?: string
    }>
  }
}


/** Faction specific dynamic data */
interface FactionData {
  /** The actual data */
  factions: {
    /** String used to refer to this faction ("usa") */
    [faction: string]: {
      /** Internally tracked count of users in this faction */
      count: number
      /** Global faction points */
      points: number
      /** Total quest points towards this faction */
      questPoints: number
    }
  }
}

interface CommandData {
  /** The channel which the bot reads for commands */
  readonly commands: {
    [command: string]: {
      /** The message sent */
      text: string
      /** Commands which also call this message */
      alias?: string[]
    }
  }
}


interface GuildData {
  /** The channel which the bot reads for commands */
  readonly botChannels: ChannelID[]
  /** Granted when joining the channel. Removed when finishing a quest or skipping */
  readonly joinRoles: RoleId[]
  /** Granted when doing a quest */
  readonly questingRoles: RoleId[]
  /** Granted when finishing a quest succesfully */
  readonly finishRoles: RoleId[]
  /** Granted when skipping a quest. The skip role is removed if the member has finished any quests */
  readonly skipRoles: RoleId[]
  /** Whether or not to randomize faction role order every day */
  readonly dailyRandomizeOrder: boolean
  /** Factions */
  readonly factions: {
    /** String used to refer to this faction ("usa") */
    readonly [name: string]: {
      /** Full name ("United States of America") */
      readonly title: RoleId
      /** Roles(s) granted when user is selected for this faction */
      readonly role: RoleId

      /** The main channel of a faction */
      readonly mainChannel: ChannelID
      /** Confirmation message when finishing the quest and joining this faction */
      readonly confirmationMessage: string
      /** Send this in the main channel when a user joins the faction */
      readonly newcomerMessage: string
    }
  }
  /** Quest */
  readonly quest: Quest
}


interface Quest {
  /** Start question id */
  readonly startQuestion: Randomizable<string>
  /** Message shown to the user when they reach an invalid or missing question */
  readonly deadEndMessage: Randomizable<string>
  /** Object containing all the questions */
  readonly questions: {
    /** The question id used to refer to the question */
    readonly [questionId: string]: {
      /** Shown text, array of strings for random starting quests */
      readonly text: Randomizable<string>
      /** Array of answer objects. Use arrays of arrays for randomized answers (experimental) */
      readonly answers: Array<Randomizable<{
        /** Shown text */
        readonly text: string
        /**
         * Next question id to move to after this answer is selected.  
         * Define as `"finish"` to finish the quest.  
         * Define as `"skip"` to skip the quest.  
         * Leave undefined to stay in the current question without reshowing it.  
         */
        readonly target?: Randomizable<string | string[] | 'finish' | 'skip'>
        /** Point values given towards factions */
        readonly points?: {
          /** Value is added towards faction */
          readonly [faction: string]: Randomizable<number>
        }
        /** Show `reply` in the channel where bot was answered isntead. Only applicable if user answered in guild and not in dms */
        readonly replyInGuildChannel?: true
        /** Shown after this answer is chosen */
        readonly reply?: Randomizable<string>
        /**
         * Prefix shown before this answers' text, e.g. `value) Cool answer`  
         * User must type this prefix to select this answer.  
         * Leave empty for automatic prefixing.  
         */
        readonly prefix?: string
      }>>
    }
  }
}

interface GlobalQuestData {
  [member: string]: {
    activeGuild: string
  }
}
