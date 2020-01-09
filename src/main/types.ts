import Discord from 'discord.js'

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

type GuildData = {
  // Internal
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
} & ({
  // preinitialization form
  ready: false
  botChannels?: ChannelID[]
  joinRoles?: RoleId[]
  questingRoles?: RoleId[]
  goodRoles?: RoleId[]
  badRoles?: RoleId[]
  skipRoles?: RoleId[]
  factions?: { [name: string]: { role: RoleId, points: number } }
  quest?: Quest
} | {
  ready: true
  /** The channel which the bot reads for commands */
  botChannels: ChannelID[]
  /** Granted when joining the channel. Removed when finishing a quest or skipping */
  joinRoles: RoleId[]
  /** Granted when doing a quest */
  questingRoles: RoleId[]
  /** Granted when finishing a quest goodly */
  goodRoles: RoleId[]
  /** Granted when finishing a quest badly */
  badRoles: RoleId[]
  /** Granted when skipping a quest. The skip role is removed if the member has finished any quests */
  skipRoles: RoleId[]
  /** Factions */
  factions: {
    /** Short string used to identify this faction e.g. "usa" */
    [name: string]: {
      /** Full name e.g. "United States of America" */
      title: RoleId
      /** Granted when finishing the quest with this faction having the most points */
      role: RoleId
      /** Faction points */
      points: number
    }
  }
  /** Quest */
  quest: Quest
})


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
        /** Next question id. 'good', 'bad', 'start' or 'skip' to run the respective function. Leave empty for staying in current question */
        target?: Randomizable<string | string[] | 'good' | 'bad' | 'start' | 'skip'>
        /** Point values given */
        points?: {
          /** Points given towards this faction. Used to select faction at quest end */
          [faction: string]: Randomizable<number>
        }
        /** Shown when this answer is chosen */
        message?: Randomizable<string>
        /** Higher priority answers are shown first. Answers with same values have randomized order */
        priority?: string
        /** Manual prefix. Leave empty for automatic numbering */
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
