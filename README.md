# Import Manager

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

A powerful desktop application scaffold for importing, processing, and visualizing data, built with **Tauri**, **React**, **TypeScript**, **Tailwind CSS**, and **Shadcn/UI**.

---

## 🚀 Table of Contents

1. [Key Features](#-key-features)
2. [Technology Stack](#-technology-stack)
3. [Getting Started](#-getting-started)

   * [Prerequisites](#prerequisites)
   * [Installation](#installation)
   * [Development](#development)
4. [Project Structure](#-project-structure)
5. [Usage](#-usage)
6. [Recommended Workflow](#-recommended-workflow)
7. [Contributing](#-contributing)
8. [License](#-license)
9. [Contact](#-contact)

---

## 🔑 Key Features

* **Seamless Desktop Experience**: Combines a Rust-powered Tauri backend with a React frontend for high performance and native integration.
* **Modular UI**: Leverages Shadcn/UI components and Tailwind CSS for rapid UI development and consistent design.
* **Extensible Architecture**: Scaffold supports adding custom Rust commands, React pages, and UI components with minimal configuration.
* **Type Safety**: End-to-end TypeScript enables robust type checks across frontend code.
* **Cross‑Platform**: Targets Windows, macOS, and Linux out of the box.

---

## 🛠️ Technology Stack

| Layer         | Technology                  |
| ------------- | --------------------------- |
| Desktop Shell | [Tauri](https://tauri.app/) |
| Frontend      | React 18, Vite, TypeScript  |
| Styling       | Tailwind CSS, Shadcn/UI     |
| Backend       | Rust                        |
| Linting       | ESLint, Prettier            |
| Package Mgmt. | pnpm / npm                  |

---

## 📦 Getting Started

### Prerequisites

* Node.js (v16 or higher)
* pnpm or npm
* Rust toolchain (stable)
* Tauri CLI (`cargo install tauri-cli`)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/janayuv/import-manager.git
   cd import-manager
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   # or
   npm install
   ```

### Development

1. **Start in development mode**

   ```bash
   pnpm tauri dev
   # or
   npm run tauri dev
   ```
2. The Tauri backend and Vite dev server will launch concurrently, opening the app automatically.
3. Changes in `src/` or `src-tauri/` will hot‑reload the frontend or recompile Rust commands.

---

## 📁 Project Structure

```
import-manager/
├── public/                # Static assets & icons
├── src/                   # React + TypeScript frontend
│   ├── components/        # Reusable UI components
│   ├── pages/             # Route-level views
│   └── hooks/             # Custom React hooks
├── src-tauri/             # Rust backend & Tauri config
│   ├── src/               # Rust command implementations
│   └── tauri.conf.json    # Tauri configuration
├── components.json        # Shadcn/UI registry
├── package.json           # Scripts & frontend dependencies
├── vite.config.ts         # Vite configuration
├── eslint.config.js       # ESLint ruleset
└── tsconfig.json          # TypeScript settings
```

---

## 💡 Usage

1. **Define Rust Commands**

   * Add Rust functions in `src-tauri/src/main.rs` or modules under `src-tauri/src/`
   * Mark functions with `#[tauri::command]` to expose them

2. **Invoke from React**

   ```ts
   import { invoke } from '@tauri-apps/api/tauri';

   async function fetchData() {
     const result = await invoke<'DataType'>('command_name', { /* args */ });
     // handle result
   }
   ```

3. **Build UI**

   * Use Shadcn/UI components (see `components.json`) and Tailwind classes
   * Organize pages under `src/pages` and configure routes in `src/App.tsx`

4. **Build for Production**

   ```bash
   pnpm tauri build
   # or
   npm run tauri build
   ```

   * Generates native binaries in `src-tauri/target/release/bundle`

---

## ⚙️ Recommended Workflow

1. **Branching**: Create feature branches (`feature/<name>`).
2. **Commits**: Write clear, atomic commit messages.
3. **Lint & Format**: Run `pnpm lint` and `pnpm format` before pushing.
4. **Pull Requests**: Open PRs against `main`, request reviews, and ensure CI passes.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/awesome-feature`.
3. Commit changes: `git commit -m "feat: add awesome feature"`.
4. Push to your fork: `git push origin feature/awesome-feature`.
5. Open a Pull Request and describe your changes.

Please adhere to the existing code style and include tests for new functionality.

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## 📬 Contact

Maintained by **Jana Yuv**.
Email: [jana.acc@gmail.com](mailto:jana.acc@gmail.com)


*Thank you for exploring Import Manager!*
