import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'channels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name', 100).notNullable().unique()
      table.integer('admin_id').unsigned().notNullable()
      table.boolean('is_private').defaultTo(false)
      table.timestamp('last_activity').notNullable()

      table.timestamp('created_at').notNullable()

      table.foreign('admin_id').references('id').inTable('users').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}