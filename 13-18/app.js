const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');

function setActiveButton(activeId) {
    [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

async function loadContent(page) {
    try {
        const response = await fetch(`/content/${page}.html`);
        const html = await response.text();
        contentDiv.innerHTML = html;

        if (page === 'home') {
            initNotes();
        }
    } catch (err) {
        contentDiv.innerHTML = `<p class="is-center text-error">Ошибка загрузки страницы.</p>`;
        console.error(err);
    }
}

homeBtn.addEventListener('click', () => {
    setActiveButton('home-btn');
    loadContent('home');
});
aboutBtn.addEventListener('click', () => {
    setActiveButton('about-btn');
    loadContent('about');
});

// Глобальный сокет
const socket = io('http://localhost:3001');

socket.on('taskAdded', (task) => {
    console.log('Задача от другого клиента:', task);
    const notification = document.createElement('div');
    notification.textContent = `Новая задача: ${task.text}`;
    notification.style.cssText = `
        position: fixed; top: 10px; right: 10px;
        background: #8e24aa; color: white; padding: 1rem;
        border-radius: 5px; z-index: 1000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
});

// Функционал заметок (localStorage)
function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const reminderForm = document.getElementById('reminder-form');
    const reminderText = document.getElementById('reminder-text');
    const reminderTime = document.getElementById('reminder-time');
    const list = document.getElementById('notes-list');

    window.loadNotes = function() {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        list.innerHTML = notes.map(note => {
            let reminderInfo = '';
            if (note.reminder) {
                const date = new Date(note.reminder);
                reminderInfo = `<br><small style="color:#d32f2f;">!!! Напоминание: ${date.toLocaleString()}</small>`;
            }
            return `<li class="card" style="margin-bottom: 0.5rem; padding: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div><strong>${note.text}</strong>${reminderInfo}</div>
                <button class="button outline primary" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; margin-left: 1rem;" onclick="deleteNote(${note.id})">Удалить</button>
            </li>`;
        }).reverse().join('');
    };

    window.addNote = function(text, reminderTimestamp = null) {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const newNote = { id: Date.now(), text, reminder: reminderTimestamp };
        notes.push(newNote);
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();

        if (reminderTimestamp) {
            socket.emit('newReminder', {
                id: newNote.id,
                text: text,
                reminderTime: reminderTimestamp
            });
        } else {
            socket.emit('newTask', { text, timestamp: Date.now() });
        }
    };

    // Обычные заметки
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
            addNote(text);
            input.value = '';
        }
    });

    // Заметки с напоминанием
    reminderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = reminderText.value.trim();
        const datetime = reminderTime.value;
        if (text && datetime) {
            const timestamp = new Date(datetime).getTime();
            if (timestamp > Date.now()) {
                addNote(text, timestamp);
                reminderText.value = '';
                reminderTime.value = '';
            } else {
                alert('Дата напоминания должна быть в будущем');
            }
        }
    });

    // Удаление заметки
    window.deleteNote = function(id) {
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        notes = notes.filter(n => n.id !== id);
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();
    };

    loadNotes();
}

// Загружаем главную страницу при старте
loadContent('home');

// Вспомогательная функция для VAPID
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const PUBLIC_VAPID_KEY = 'BB6KOUs0gm1pTREWh7aHDpCfShMXv4GpFHVeM3YpkEPrOoeKxGJxgifENcPLOcuoIqhwso2DqIvd0bOny256Ew4';

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });

        await fetch('http://localhost:3001/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        console.log('Подписка на push отправлена');
    } catch (err) {
        console.error('Ошибка подписки на push:', err);
    }
}

async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await fetch('http://localhost:3001/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            await subscription.unsubscribe();
            console.log('Отписка выполнена');
        }
    } catch (err) {
        console.error('Ошибка отписки от push:', err);
    }
}

// Регистрация Service Worker и настройка кнопок
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('SW registered:', reg.scope);

            const enableBtn = document.getElementById('enable-push');
            const disableBtn = document.getElementById('disable-push');

            if (enableBtn && disableBtn) {
                const subscription = await reg.pushManager.getSubscription();
                if (subscription) {
                    enableBtn.style.display = 'none';
                    disableBtn.style.display = 'inline-block';
                }

                enableBtn.addEventListener('click', async () => {
                    if (Notification.permission === 'denied') {
                        alert('Уведомления запрещены. Разрешите их в настройках браузера.');
                        return;
                    }
                    if (Notification.permission === 'default') {
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') {
                            alert('Необходимо разрешить уведомления.');
                            return;
                        }
                    }
                    await subscribeToPush();
                    enableBtn.style.display = 'none';
                    disableBtn.style.display = 'inline-block';
                });

                disableBtn.addEventListener('click', async () => {
                    await unsubscribeFromPush();
                    disableBtn.style.display = 'none';
                    enableBtn.style.display = 'inline-block';
                });
            }
        } catch (err) {
            console.log('SW registration failed:', err);
        }
    });
}
