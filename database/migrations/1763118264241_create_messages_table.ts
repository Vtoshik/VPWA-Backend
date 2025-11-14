import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable()
      table.integer('channel_id').unsigned().notNullable()
      table.text('text').notNullable()

      table.timestamp('send_at').notNullable()

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')

      table.index(['channel_id', 'send_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}