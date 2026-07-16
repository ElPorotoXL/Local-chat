import express from 'express'
import logger from 'morgan'
import pool from '../db/client.js'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

BigInt.prototype.toJSON = function() { return this.toString() }


const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

app.disable('x-powered-by')
app.use(express.json())

io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) {
        return next(new Error('Authentication error'))
    }
    try {
        const JWT_SECRET = process.env.JWT_SECRET
        if (!JWT_SECRET) {
            return next(new Error('JWT secret not configured'))
        }
        const decoded = jwt.verify(token, JWT_SECRET)
        socket.user = {
            id: decoded.id,
            username: decoded.username
        }
        next()
    } catch (error) {
        return next(new Error('Authentication error'))
    }
})

io.on('connection', async (socket) => {
    console.log(`user connected: ${socket.user.username}`)

    socket.on('disconnect', () => {
        console.log('user disconnected')
    })

    console.log(socket.handshake.auth)
    if (!socket.recovered) {
    try {
        const sql = `SELECT IdMessage, Message, UserName 
        FROM messages m 
        INNER JOIN users u ON m.IdUser = u.IdUser  
        WHERE IdMessage > ?`
        const offset = socket.handshake.auth.serverOffset || 0
        console.log('Loading messages from offset:', offset)
        const results = await pool.query(sql, [offset])
        results.rows.forEach(message => {
            socket.emit('chat message', {
                message: message.Message,
                username: message.UserName,
                id: message.IdMessage.toString()
            })
        })
    } catch (error) {
        console.error('Error loading messages', error)
    }
    }
    socket.on('chat message', async (msg) => {
        try {
            const sql = 'INSERT INTO messages (Message, IdUser) VALUES (?, ?)'
            const userID = socket.user.id || null
            if (!userID) {
                console.error('User ID not found')
                return
            }
            const result = await pool.query(sql, [msg, userID])
            console.log('Message saved')
            const idMessage = result.lastInsertRowid || result.insertId
            io.emit('chat message', { message: msg, username: socket.user.username, id: idMessage })
        } catch (error) {
            console.error('Error saving message', error)
        }
    })
})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

app.get('/style.css', (req, res) => {
    res.sendFile(process.cwd() + '/client/style.css')
})

app.post('/register', async (req, res) => {
    const username = req.body.UserName
    const password = req.body.Password

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' })
    }

    try {
        const saltRounds = 10
        const passwordHash = await bcrypt.hash(password, saltRounds)

        const sql = 'INSERT INTO users (UserName, Password) VALUES (?, ?)'
        const result = await pool.query(sql, [username, passwordHash])
        return res.status(201).json({ message: 'User registered successfully' })
    } catch (error) {
        console.error('Error registering user', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/login', async (req, res) => {
    const username = req.body.UserName
    const password = req.body.Password

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' })
    }

    try {
        const sql = 'SELECT * FROM users WHERE UserName = ?'
        const result = await pool.query(sql, [username])
        if (!result.rows.length) {
            return res.status(401).json({ error: 'Invalid username or password' })
        }
        const user = result.rows[0]
        const passwordMatch = await bcrypt.compare(password, user.Password)
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' })
        }
        const token = jwt.sign({ id: user.IdUser, username: user.UserName },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        )
        return res.status(200).json({ 
            message: 'User logged in successfully',
            token,
            username: user.UserName
        })
    } catch (error) {
        console.error('Error logging in user', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
})

app.get('/login', (req, res) => {
    res.sendFile(process.cwd() + '/client/login.html')
})
app.get('/login.css', (req, res) => {
    res.sendFile(process.cwd() + '/client/login.css')
})

app.get('/register', (req, res) => {
    res.sendFile(process.cwd() + '/client/register.html')
})
app.get('/register.css', (req, res) => {
    res.sendFile(process.cwd() + '/client/register.css')
})


const port = process.env.PORT || 3000

server.listen(port, () => {
    console.log(`Server started on port http://localhost:${port}`)
})
