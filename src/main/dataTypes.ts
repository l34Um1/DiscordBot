import { GuildMember, Role, Guild, User, Channel } from 'discord.js'

// ---------------------- //
// Faction bot stuff here //
// ---------------------- //

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
type Faction = (StaticGuildData['factions'] extends undefined | infer X ? X : never)[string]
type UserData = GuildUserData[string]

// ----------------------- //
// customizable data stuff //
// ----------------------- //

type CombinedGuildData = {
  userData: GuildUserData
} & StaticGuildData

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

type StaticGuildData = ({
  // preinitialization form
  readonly ready: false
  readonly botChannels?: ChannelID[]
  readonly joinRoles?: RoleId[]
  readonly questingRoles?: RoleId[]
  readonly finishRoles?: RoleId[]
  readonly skipRoles?: RoleId[]
  readonly factions?: { [name: string]: { role: RoleId, points: number } }
  readonly quest?: Quest
} | {
  // Intialized form
  /** Initialized or not */
  readonly ready: true
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

      /** Faction wide points */
      readonly points: number
    }
  }
  /** Quest */
  readonly quest: Quest
})


interface Quest {
  /** Start question id */
  startQuestion: Randomizable<string>
  /** Message shown to the user when they reach an invalid or missing question */
  deadEndMessage: Randomizable<string>
  /** Object containing all the questions */
  questions: {
    /** The question id used to refer to the question */
    [questionId: string]: {
      /** Shown text, array of strings for random starting quests */
      text: Randomizable<string>
      /** Array of answer objects. Use arrays of arrays for randomized answers (experimental) */
      answers: Array<Randomizable<{
        /** Shown text */
        text: string
        /**
         * Next question id to move to after this answer is selected.  
         * Define as `"finish"` to finish the quest.  
         * Define as `"start"` to retry the quest.  
         * Define as `"skip"` to skip the quest.  
         * Leave undefined to stay in the current question without reshowing it.  
         */
        target?: Randomizable<string | string[] | 'finish' | 'start' | 'skip'>
        /** Point values given towards factions */
        points?: {
          /** Value is added towards faction */
          [faction: string]: Randomizable<number>
        }
        /** Shown after this answer is chosen */
        reply?: Randomizable<string>
        /**
         * Prefix shown before this answers' text, e.g. `value) Cool answer`  
         * User must type this prefix to select this answer.  
         * Leave empty for automatic prefixing.  
         */
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
