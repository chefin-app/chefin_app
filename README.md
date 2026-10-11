# Chefin 🍽️

**Chefin** is a community-powered food platform that connects local home cooks with diners looking for authentic, home-cooked meals. Whether you're ordering for delivery, picking up nearby, or (optionally) dining in at a host’s home, Chefin is all about trust, taste, and togetherness.

---

## 🌟 Features

- Browse and order food from verified local cooks
- Secure payments with Stripe
- Cook verification (e.g., food safety license upload)
- Multi-platform support (iOS & Android via Expo)
- Scalable and maintainable codebase with TypeScript

---

## Presenting the POC

Run `npm run start:poc` (or `npm run start:poc -- --web`) to use a minified,
production-mode JavaScript bundle. Keep the backend running and open the main
screens once before presenting so Metro compilation is finished. This command
still uses the local Expo server; it is not an offline or standalone release.

Discovery reads share concurrent requests and reuse results in memory for 30
seconds. Home keeps content visible on refresh and renders only nearby feed
cards. Availability, menus, authentication and checkout still use real services;
no mock orders or payments are introduced. Restart the backend to load its query
optimizations. Device/network latency still needs to be measured on the actual
presentation device.

## 🧱 Tech Stack

| Layer          | Tech                            |
| -------------- | ------------------------------- |
| Frontend       | React Native (Expo), TypeScript |
| Backend        | Node.js (Express)               |
| Database       | PostgreSQL (via Prisma ORM)     |
| Authentication | Supabase Auth                   |
| Payments       | Stripe                          |
| Storage        | Supabase Storage                |
| Hosting/API    | Vercel or Render                |

---

## 🛠️ Project Setup

### Prerequisites

- Node.js >= 18.x
- Yarn or npm
- Expo CLI (`npm install -g expo-cli`)
- PostgreSQL
- Supabase project (for auth/storage)
- Stripe developer account

### Installation

```bash
git clone https://github.com/your-username/chefin.git
cd chefin
yarn install
```

Environment Setup

Create a .env file in the root with:

```
SUPABASE_URL=your-url
SUPABASE_ANON_KEY=your-key
STRIPE_PUBLISHABLE_KEY=your-pub-key
STRIPE_SECRET_KEY=your-secret-key
```

Run the App

```
expo start
```

⸻

📁 Folder Structure

```
src/
  app/               # Entry layout, tabs, constants
  assets/
    images/
  components/        # Reusable UI components
  features/          # Feature-specific logic (cook profiles, orders, etc.)
  hooks/             # Custom React hooks
  navigation/        # App navigation (React Navigation)
  screens/           # Screen components
  services/          # API clients (Supabase, Stripe)
  styles/            # Global styles/themes
  utils/             # Helper utilities
```

⸻

🚀 Getting Started (GitHub Issues Roadmap)

Here’s a suggested chronological order of GitHub issues for development:

🔧 Setup & Configuration

1.  Set up Expo with TypeScript and folder structure
2.  Configure Supabase project and connect client
3.  Integrate Tailwind (via NativeWind) for styling
4.  Set up navigation (stack/tabs)
5.  Add dotenv support for environment variables

👤 Authentication 6. Implement sign-up and login with Supabase Auth 7. Add profile creation and onboarding flows 8. Add logout and session persistence

🍳 Cook Onboarding Flow 9. Form: host type (private/business) 10. Form: food safety license upload 11. Form: cuisine type, description, location

🍽️ Diner Features 12. Create landing page with featured cooks 13. Add map/list view to discover local cooks 14. Filter by cuisine, price, location 15. Show cook details and dish menu

🛒 Ordering 16. Implement ordering UI (delivery, pickup, dine-in) 17. Add cart and checkout screen 18. Integrate Stripe payments 19. Confirm and track orders

🧾 Admin & Settings 20. Add account management (edit profile, change password) 21. Cook dashboard: manage menu and orders 22. Notifications (order status updates)

⸻

🧑‍💻 Contributing

Before you start:

1. Fork the repository
2. Create a feature branch:

```
git checkout -b feature/your-feature-name
```

3. Make changes and commit:

```
git commit -m "Add: Description of your change"
```

4. Push to your fork and open a pull request

⸻

📄 License

This project is licensed under the MIT License.

⸻

💡 Motto

Chefin – Taste The World, One Home At A Time!

⸻

🙌 Credits

Built with ❤️ by Nathan Lim, Bavornkiet Charnpatanakorn, Alexander Agafonov and Nicholas Zambrano.
