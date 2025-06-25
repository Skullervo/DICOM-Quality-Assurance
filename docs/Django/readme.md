## 🏗️ 1. Start a New Django Project

```bash
django-admin startproject project .
```

The dot . means "create the project in the current folder".

🧪 2. Run the Development Server
```bash
python manage.py runserver
```

Visit your project in the browser at: http://127.0.0.1:8000

🧱 3. Create a New App
```bash
python manage.py startapp my_app
```

Then add 'my_app' to INSTALLED_APPS in project/settings.py:

```python
INSTALLED_APPS = [
    ...
    'my_app',
]
```

## 🗂️ 4. Set Up the Database

Run migrations:

```bash
python manage.py migrate
```

Create an admin user (not mandatory):

```bash
python manage.py createsuperuser
```