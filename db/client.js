import { createClient } from '@libsql/client'

const client = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_TOKEN
})

const pool = {
    async query(sql, params = []) {
        try {
            const result = await client.execute({
                sql,
                args: params
            })
            return result
        } catch (error) {
            console.error('error executing query', error)
            throw error
        }
    }
}

export default pool
