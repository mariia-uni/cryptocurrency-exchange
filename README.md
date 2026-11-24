# Crypto Exchange Diploma Project

Навчальний full-stack проєкт криптовалютної біржі. Проєкт містить React-клієнт для користувачів та адміністратора й REST API на Rust для автентифікації, верифікації, роботи з гаманцями, ринковими даними, депозитами, виведенням коштів і ф'ючерсними позиціями.

## Основний функціонал

### Користувачі та автентифікація
- Реєстрація та вхід за допомогою email і пароля.
- Зберігання JWT-токена на клієнті та захищені маршрути.
- Хешування паролів за допомогою Argon2.
- Скидання забутого пароля через email і одноразовий reset-токен.
- Перегляд і редагування налаштувань профілю.
- Розмежування ролей користувача та адміністратора.

### Верифікація особи
- Двоетапна перевірка: введення персональних даних і завантаження документа.
- Підтримка файлів JPG, PNG та PDF.
- Статуси верифікації: очікує перевірки, схвалено або відхилено.
- Маршрут із обов'язковою верифікацією для фінансових операцій.
- Черга верифікації та перегляд документів в адмін-панелі.

### Ринки та котирування
- Отримання актуального списку криптовалют з CoinMarketCap.
- Періодична синхронізація даних про криптовалюти кожні 12 годин.
- Кешування поточних цін і оновлення ринкових даних.
- Сторінка ринку, пошук активів і графіки TradingView.
- Отримання доступних мереж і метаданих для вибору активу.

### Гаманці та активи
- Створення гаманців для підтримуваних криптовалют і мереж.
- Генерація криптовалютних адрес для гаманець.
- Перегляд балансів, деталей конкретного гаманця та загального портфеля.
- Кругова/інша візуалізація розподілу портфеля за вартістю в USD.
- Історія транзакцій та внутрішні перекази між гаманцями.

### Депозити та виведення
- Перегляд доступних криптовалют і мереж для поповнення або виведення.
- Введення депозитної операції та оновлення балансу.
- Створення заявки на виведення коштів із перевіркою адреси, мережі, комісії й доступного балансу.
- Перегляд історії депозитів і виведень.

### Ф'ючерсна торгівля
- Окремий баланс ф'ючерсного рахунку.
- Поповнення ф'ючерсного рахунку з основного гаманець.
- Відкриття довгих (Long) і коротких (Short) позицій із вибором розміру та кредитного плеча.
- Перегляд відкритих позицій і ручне закриття позиції.
- Облік реалізованого P&L, історії операцій і автоматична перевірка ліквідації.

### Адміністрування
- Перегляд користувачів і пошук по платформі.
- Створення та редагування користувачів адміністратором.
- Перегляд черги верифікації.
- Схвалення або відхилення верифікаційних заявок.

## Технології

### Frontend
- React 19
- React Router 7
- Chart.js та react-chartjs-2
- TradingView Widget
- Axios
- Formik і Yup

### Backend
- Rust edition 2024
- Actix Web
- PostgreSQL
- Diesel ORM і Diesel migrations
- JWT / JSON Web Token
- Argon2
- SMTP через Lettre
- CoinMarketCap API
- Web3-криптографічні бібліотеки для адрес і підписів

## Команди для запуску

### 1. Перейти до кореня проєкту

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange
```

Замініть цей шлях, якщо проєкт розташовано в іншій директорії.

### 2. Створити базу даних PostgreSQL

Перевірте стан PostgreSQL:

```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

Створіть користувача та базу даних:

```bash
sudo -u postgres psql
```

Виконайте в терміналі PostgreSQL:

```sql
CREATE USER crypto_user WITH PASSWORD 'crypto_password';
CREATE DATABASE crypto_exchange OWNER crypto_user;
\q
```

Якщо користувач або база даних вже створені, пропустіть відповідні команди або змініть значення у файлі `crypto-exchange-app/.env`.

### 3. Встановити залежності backend

```bash
cd crypto-exchange-app
cargo install diesel_cli --no-default-features --features postgres
```

Встановлення Diesel CLI потрібно виконати один раз. Якщо утиліта вже встановлена, цю команду можна пропустити.

Застосуйте міграції бази даних:

```bash
diesel migration run
```

Запустіть сервер API:

```bash
cargo run
```

Backend буде доступний за адресою:

```text
http://127.0.0.1:8080
```

Перевірити роботу сервера можна окремою командою:

```bash
curl http://127.0.0.1:8080/
```

### 4. Встановити та запустити frontend

Відкрийте другий термінал, перейдіть до клієнтської частини та встановіть залежності:

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange/crypto-exchange-client
npm install
npm start
```

Frontend буде доступний за адресою:

```text
http://localhost:3000
```

React використовує backend за адресою `http://localhost:8080` і налаштовує проксі в `package.json`.

### 5. Запуск у двох терміналах

Термінал 1 — backend:

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange/crypto-exchange-app
diesel migration run
cargo run
```

Термінал 2 — frontend:

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange/crypto-exchange-client
npm install
npm start
```

Для запуску backend у режимі автоматичного перезапуску під час змін можна встановити та використовувати `cargo-watch`:

```bash
cargo install cargo-watch
cargo watch -x run
```

Для зупинки backend або frontend натисніть `Ctrl+C` у відповідному терміналі.

### 6. Конфігурація environment-змінних

Переконайтеся, що файл `crypto-exchange-app/.env` містить потрібні параметри:

```dotenv
DATABASE_URL=postgres://crypto_user:crypto_password@localhost/crypto_exchange
HOST=127.0.0.1
PORT=8080
JWT_SECRET=replace_with_a_long_random_secret
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-smtp-app-password
FRONTEND_URL=http://localhost:3000
```

### Додаткові команди

Перевірка збірки backend:

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange/crypto-exchange-app
cargo check
cargo build
```

Production-збірка frontend:

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange/crypto-exchange-client
npm run build
```

Показати поточний стан міграцій:

```bash
cd /home/maria/Documents/knu/3sem/cryptocurrency-exchange/crypto-exchange-app
diesel migration list
```

Відкотити останню міграцію:

```bash
diesel migration revert
```

