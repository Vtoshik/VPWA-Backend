import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bans'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable()
      table.integer('channel_id').unsigned().notNullable()
      table.json('banned_by').notNullable()
      table.boolean('is_permanent').defaultTo(false)
      table.text('reason').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('unbanned_at').nullable()

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')

      table.unique(['user_id', 'channel_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}