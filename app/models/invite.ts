import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Channel from './channel.js'

export default class Invite extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fromUserId: number

  @column()
  declare toUserId: number

  @column()
  declare channelId: number

  @column()
  declare status: 'accepted' | 'rejected' | 'pending'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User, {
    foreignKey: 'fromUserId',
  })
  declare fromUser: BelongsTo<typeof User>

  @belongsTo(() => User, {
    foreignKey: 'toUserId',
  })
  declare toUser: BelongsTo<typeof User>

  @belongsTo(() => Channel)
  declare channel: BelongsTo<typeof Channel>
}
