import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Message from './message.js'
import User from './user.js'

export default class MentionedUser extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare messageId: number

  @column()
  declare userId: number

  @belongsTo(() => Message)
  declare message: BelongsTo<typeof Message>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
