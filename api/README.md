# Dashboard API Setup

This directory contains the PHP backend for the Weather Dashboard application.

## Prerequisites

- MySQL/MariaDB server running
- PHP with PDO MySQL extension
- Web server (Apache/Nginx) with PHP support

## Setup Instructions

### 1. Run the setup script

```bash
cd /var/www/html/testing/api
./setup.sh
```

You'll be prompted for your MySQL root password. The script will:
- Create the `dashboard` database
- Create a user `dashboard_user` with password `dashboard_pass`
- Create all required tables

### 2. Verify the setup

Test the API endpoint:
```bash
curl http://localhost/testing/api/index.php/entries
```

You should see an empty JSON array: `[]`

## Database Structure

The setup creates the following tables:

- **calendar_entries**: Manual calendar entries
- **chores**: Daily chores with completion tracking
- **recurring_entries**: Recurring calendar entries configuration
- **recurring_chores**: Recurring chores configuration
- **monthly_completions**: Monthly completion counts per family member
- **gcal_config**: Google Calendar API configuration

## API Endpoints

All endpoints accept and return JSON.

### Calendar Entries
- `GET /api/index.php/entries` - Get all entries
- `POST /api/index.php/entries` - Create new entry
- `DELETE /api/index.php/entries/{id}` - Delete entry

### Chores
- `GET /api/index.php/chores` - Get all chores
- `POST /api/index.php/chores` - Create new chore
- `PUT /api/index.php/chores/{id}` - Update chore (completion status)
- `DELETE /api/index.php/chores/{id}` - Delete chore

### Recurring Entries
- `GET /api/index.php/recurring-entries` - Get all recurring entries
- `POST /api/index.php/recurring-entries` - Create recurring entry
- `DELETE /api/index.php/recurring-entries/{id}` - Delete recurring entry

### Recurring Chores
- `GET /api/index.php/recurring-chores` - Get all recurring chores
- `POST /api/index.php/recurring-chores` - Create recurring chore
- `DELETE /api/index.php/recurring-chores/{id}` - Delete recurring chore

### Completions
- `GET /api/index.php/completions` - Get monthly completion counts
- `POST /api/index.php/completions` - Update completion count

### Google Calendar Config
- `GET /api/index.php/gcal-config` - Get configuration
- `POST /api/index.php/gcal-config` - Save configuration

## Configuration

Database credentials can be changed in `config.php`:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'dashboard');
define('DB_USER', 'dashboard_user');
define('DB_PASS', 'dashboard_pass');
```

If you change the credentials, remember to update your MySQL user permissions accordingly.
