import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable()
      table.integer('message_id').unsigned().notNullable()
      table.string('type', 50).notNullable()
      table.boolean('is_read').defaultTo(false)

      table.timestamp('created_at').notNullable()

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('message_id').references('id').inTable('messages').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}