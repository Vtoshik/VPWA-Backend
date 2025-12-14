import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Channel from './channel.js'

export default class Ban extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare channelId: number

  @column({
    prepare: (value: number[]) => JSON.stringify(value),
    consume: (value: string | number[]) => {
      // If already an array, return as is
      if (Array.isArray(value)) {
        return value
      }
      // If it's a string, parse it
      if (typeof value === 'string') {
        return JSON.parse(value)
      }
      // If it's a single number, wrap in array
      if (typeof value === 'number') {
        return [value]
      }
      // Fallback to empty array
      return []
    },
  })
  declare bannedBy: number[]

  @column()
  declare isPermanent: boolean

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare unbannedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Channel)
  declare channel: BelongsTo<typeof Channel>
}
