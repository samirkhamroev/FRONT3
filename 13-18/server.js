const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const vapidKeys = {
    publicKey: 'BB6KOUs0gm1pTREWh7aHDpCfShMXv4GpFHVeM3YpkEPrOoeKxGJxgifENcPLOcuoIqhwso2DqIvd0bOny256Ew4',
    privateKey: 'dMHf52bVIAmdmhuoHlp2S9H_aKZ6HLEJDpG_4nSc5ZA'
};

webpush.setVapidDetails(
    'mailto:test@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Раздаем статику из корня
app.use(express.static(path.join(__dirname, './')));

let subscriptions = [];
// Хранилище активных напоминаний: ключ id заметки, значение объект с таймером и данными
const reminders = new Map();

const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    console.log('Клиент подключён:', socket.id);

    // Обычная заметка
    socket.on('newTask', (task) => {
        io.emit('taskAdded', task);

        // Рассылаем обычный push
        const payload = JSON.stringify({
            title: 'Новая задача',
            body: task.text
        });
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
        });
    });

    // Заметка с напоминанием
    socket.on('newReminder', (reminder) => {
        const { id, text, reminderTime } = reminder;
        const delay = reminderTime - Date.now();
        if (delay <= 0) return;

        const timeoutId = setTimeout(() => {
            const payload = JSON.stringify({
                title: '!!! Напоминание',
                body: text,
                reminderId: id
            });
            subscriptions.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
            });
            reminders.delete(id);
        }, delay);
        reminders.set(id, { timeoutId, text, reminderTime });
    });

    socket.on('disconnect', () => {
        console.log('Клиент отключён:', socket.id);
    });
});

app.post('/subscribe', (req, res) => {
    subscriptions.push(req.body);
    res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
    res.status(200).json({ message: 'Подписка удалена' });
});

app.post('/snooze', (req, res) => {
    const reminderId = parseInt(req.query.reminderId, 10);
    if (!reminderId || !reminders.has(reminderId)) {
        return res.status(404).json({ error: 'Reminder not found' });
    }
    const reminder = reminders.get(reminderId);
    clearTimeout(reminder.timeoutId);
    const newDelay = 5 * 60 * 1000; // 5 минут
    const newTimeoutId = setTimeout(() => {
        const payload = JSON.stringify({
            title: 'Напоминание отложено',
            body: reminder.text,
            reminderId: reminderId
        });
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
        });
        reminders.delete(reminderId);
    }, newDelay);

    reminders.set(reminderId, {
        timeoutId: newTimeoutId,
        text: reminder.text,
        reminderTime: Date.now() + newDelay
    });
    res.status(200).json({ message: 'Reminder snoozed for 5 minutes' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
