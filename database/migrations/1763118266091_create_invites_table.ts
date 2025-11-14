import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invites'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('from_user_id').unsigned().notNullable()
      table.integer('to_user_id').unsigned().notNullable()
      table.integer('channel_id').unsigned().notNullable()
      table.enum('status', ['accepted', 'rejected', 'pending']).defaultTo('pending')

      table.timestamp('created_at').notNullable()

      table.foreign('from_user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('to_user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}