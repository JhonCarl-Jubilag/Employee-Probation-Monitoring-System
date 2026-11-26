# Employee Probation Management System

A web system for managing employee profiles, probation periods, supervisor evaluations, and HR decisions.

## Tech stack

- Backend: NestJS, TypeScript, TypeORM, MySQL 8, JWT, and bcryptjs
- Frontend: React, TypeScript, Vite, and Tabler UI

## Run locally

You need Node.js 24.x and MySQL 8. Import the supplied `employee_probation_db.sql` export into MySQL. Create a `.env` file beside this README with your local settings:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_DATABASE=employee_probation_db
JWT_SECRET=replace_with_a_random_secret_of_at_least_32_bytes
PORT=3000
```

Start the backend from the project root:

```powershell
npm ci
npm run start:dev
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` to use the system. The API runs at `http://localhost:3000/api`. Sign in with an existing `HR_ADMIN` account. Keep `.env` private and do not commit it.
