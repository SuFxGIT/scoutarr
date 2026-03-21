import { useEffect, useState } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CheckIcon, Cross2Icon } from '@radix-ui/react-icons';
import { Flex, Text } from '@radix-ui/themes';
import { subscribe, type ToastItem } from '../utils/toast';

type ToastEntry = ToastItem & { open: boolean };

export function Toaster() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    return subscribe(item =>
      setToasts(prev => [...prev, { ...item, open: true }])
    );
  }, []);

  function dismiss(id: string) {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, open: false } : t)));
  }

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map(t => (
        <Toast.Root
          key={t.id}
          className="toast-item"
          open={t.open}
          onOpenChange={open => { if (!open) dismiss(t.id); }}
          duration={4000}
          style={{
            background: t.variant === 'success' ? 'var(--green-3)' : 'var(--red-3)',
            border: `1px solid ${t.variant === 'success' ? 'var(--green-9)' : 'var(--red-9)'}`,
            borderRadius: 'var(--radius-2)',
            padding: '8px 12px',
          }}
        >
          <Toast.Title asChild>
            <Flex align="center" gap="2">
              {t.variant === 'success'
                ? <CheckIcon style={{ color: 'var(--green-9)', flexShrink: 0 }} />
                : <Cross2Icon style={{ color: 'var(--red-9)', flexShrink: 0 }} />}
              <Text size="1" style={{ color: t.variant === 'success' ? 'var(--green-11)' : 'var(--red-11)' }}>
                {t.message}
              </Text>
            </Flex>
          </Toast.Title>
        </Toast.Root>
      ))}
      <Toast.Viewport
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          listStyle: 'none',
          padding: 0,
          margin: 0,
          zIndex: 2147483647,
          outline: 'none',
        }}
      />
    </Toast.Provider>
  );
}
