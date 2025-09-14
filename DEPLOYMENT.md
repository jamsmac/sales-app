# Deployment Guide - Railway + Supabase

## 🚀 Deployment Steps

### 1. Railway Configuration

#### Environment Variables
Set these variables in Railway Dashboard:

**Required:**
```
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-here-change-this
DATABASE_TYPE=supabase
```

**For Supabase (recommended for production):**
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Optional:**
```
LOG_LEVEL=info
MAX_FILE_SIZE=52428800
LOGIN_ATTEMPTS_LIMIT=5
LOGIN_LOCKOUT_TIME=15
```

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Settings → API to get your keys
3. Execute the SQL schema from `supabase-schema.sql` in SQL Editor
4. Set up Row Level Security (RLS) policies if needed

### 3. Deploy to Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway Dashboard
3. Deploy will happen automatically on git push

### 4. Health Check

Railway will check `/health` endpoint for application health.

## 🔧 Configuration Files

- `railway.toml` - Railway deployment configuration
- `package.json` - Node.js version specified in engines
- `Procfile` - Process configuration for Railway

## 🗄️ Database Options

### SQLite (Development)
```
DATABASE_TYPE=sqlite
```
- Local file-based database
- Good for development and testing
- Data persists in Railway volumes

### Supabase (Production - Recommended)
```
DATABASE_TYPE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```
- Cloud PostgreSQL database
- Better for production
- Automatic backups and scaling

## 🚨 Common Issues

### 1. Port Issues
- Railway automatically sets PORT environment variable
- Application listens on `0.0.0.0:${PORT}`

### 2. Environment Variables
- Make sure all required variables are set in Railway
- JWT_SECRET must be changed from default

### 3. Database Connection
- For Supabase: Check URL and service key
- For SQLite: Data directory will be created automatically

### 4. File Uploads
- uploads/ directory is excluded from git
- Files are stored temporarily in Railway
- Consider using Supabase Storage for persistent files

## 📊 Monitoring

- Check Railway logs for errors
- Use `/health` endpoint to verify application status
- Monitor Supabase dashboard for database performance

## 🔐 Security

- Change default JWT_SECRET
- Use strong passwords for test accounts
- Enable RLS in Supabase for production
- Set appropriate CORS origins

## 📝 Test Accounts

Default test accounts (change passwords in production):
- Admin: `admin` / `admin123`
- Accountant: `buh1` / `buh123`

## 🔄 Updates

To update the application:
1. Push changes to GitHub
2. Railway will automatically redeploy
3. Check deployment logs for any issues
