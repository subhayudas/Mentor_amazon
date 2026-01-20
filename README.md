# MentorConnect

A modern mentorship platform connecting Amazon employees with mentees for professional development and growth.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier works)

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**

Create `client/.env`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. **Run the development server:**
```bash
npm run dev
```

Visit `http://localhost:5173`

## 📚 Documentation

- **[Complete Setup Guide](./CLIENT_ONLY_SETUP.md)** - Detailed setup instructions, Supabase configuration, and RLS policies
- **[Design Guidelines](./design_guidelines.md)** - UI/UX design system and component guidelines
- **[Backend Services](./BACKEND_SERVICES.md)** - Original backend documentation (legacy)

## 🏗️ Architecture

**Frontend-Only Architecture** - No backend server required!

- **Frontend**: React + TypeScript + Vite
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS
- **State Management**: React Query

## ✨ Features

### For Mentors
- ✅ Create and manage profile
- ✅ Set availability and preferences
- ✅ Accept/decline booking requests
- ✅ Integrated Cal.com scheduling
- ✅ Track sessions and earnings
- ✅ Provide and receive feedback
- ✅ Task management dashboard

### For Mentees
- ✅ Browse mentor directory with filters
- ✅ Request mentorship sessions
- ✅ Book sessions via Cal.com
- ✅ Track session history
- ✅ Rate and review mentors
- ✅ Multi-language support (English/Arabic)

### Platform Features
- 🔐 Secure authentication with Supabase Auth
- 📧 Real-time notifications
- 🌍 Multi-language support (i18n)
- 📱 Responsive design
- 🎨 Modern UI with shadcn/ui components
- 🔔 In-app notification system

## 🛠️ Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run check    # Type check
npm run db:push  # Push database schema
```

### Project Structure

```
MentorConnect/
├── client/
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   ├── lib/           # Core services
│   │   │   ├── supabase.ts   # Supabase client
│   │   │   ├── auth.ts       # Auth service
│   │   │   ├── database.ts   # DB operations
│   │   │   ├── storage.ts    # File uploads
│   │   │   └── services.ts   # Business logic
│   │   ├── context/       # React contexts
│   │   └── hooks/         # Custom hooks
│   └── public/            # Static assets
├── shared/                # Shared types
└── attached_assets/       # Media files
```

## 🚢 Deployment

### Vercel (Recommended)
```bash
# Build command
npm run build

# Output directory
dist

# Environment variables
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Netlify
```bash
# Build command
npm run build

# Publish directory
dist
```

### Cloudflare Pages
```bash
# Framework preset
Vite

# Build command
npm run build

# Build output directory
dist
```

## 🔧 Supabase Setup

### 1. Create Project
- Go to [supabase.com](https://supabase.com)
- Create a new project
- Note your project URL and anon key

### 2. Run Database Migrations
Use the SQL editor in Supabase dashboard to create tables (schema in `shared/schema.ts`)

### 3. Enable Row Level Security
See [CLIENT_ONLY_SETUP.md](./CLIENT_ONLY_SETUP.md) for RLS policy examples

### 4. Create Storage Bucket
- Create a bucket named `uploads`
- Configure public access or RLS policies

## 🌐 Environment Variables

### Client (.env)
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Amazon mentors participating in the program
- Supabase for the amazing backend platform
- shadcn/ui for the beautiful component library
- Cal.com for scheduling integration

---

**Need Help?** Check out [CLIENT_ONLY_SETUP.md](./CLIENT_ONLY_SETUP.md) for detailed setup instructions.

