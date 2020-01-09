
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
type UserData = GuildData['userData'][string]

// ----------------------- //
// customizable data stuff //
// ----------------------- //

type GuildData = {
  // Internal
  userData: {
    [memberId: string]: {
      quests: Array<{
        question: string
        result?: 'finish' | 'bad' | 'skip'
        startTime: number
        endTime?: number
        attempts: number
        points?: {[faction: string]: number}
        faction?: string
      }>
    }
  }
} & ({
  // preinitialization form
  ready: false
  botChannels?: ChannelID[]
  joinRoles?: RoleId[]
  questingRoles?: RoleId[]
  finishRoles?: RoleId[]
  skipRoles?: RoleId[]
  factions?: { [name: string]: { role: RoleId, points: number } }
  quest?: Quest
} | {
  // Intialized form
  /** Initialized or not */
  ready: true
  /** The channel which the bot reads for commands */
  botChannels: ChannelID[]
  /** Granted when joining the channel. Removed when finishing a quest or skipping */
  joinRoles: RoleId[]
  /** Granted when doing a quest */
  questingRoles: RoleId[]
  /** Granted when finishing a quest succesfully */
  finishRoles: RoleId[]
  /** Granted when skipping a quest. The skip role is removed if the member has finished any quests */
  skipRoles: RoleId[]
  /** Factions */
  factions: {
    /** String used to refer to this faction ("usa") */
    [name: string]: {
      /** Full name ("United States of America") */
      title: RoleId
      /** Roles(s) granted when user is selected for this faction */
      role: RoleId
      /** Faction wide points */
      points: number
    }
  }
  /** Quest */
  quest: Quest
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
        message?: Randomizable<string>
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
