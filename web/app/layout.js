import './globals.css';

export const metadata = {
  title: 'Pilot — Remote Browser',
  description: 'Drive a headless Chromium running in Docker, right from your browser.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
