export const metadata = {
  title: 'BLD Remote Browser',
  description: 'Remote control a headless Chromium running in Docker.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#0b0f17',
          color: '#e6edf3',
        }}
      >
        {children}
      </body>
    </html>
  );
}
