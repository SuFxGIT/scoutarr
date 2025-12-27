import { DropdownMenu, IconButton, Tooltip } from '@radix-ui/themes';
import { MoonIcon, SunIcon, Half2Icon } from '@radix-ui/react-icons';
import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <SunIcon />;
      case 'dark':
        return <MoonIcon />;
      case 'system':
        return <Half2Icon />;
    }
  };

  return (
    <DropdownMenu.Root>
      <Tooltip content="Change theme">
        <DropdownMenu.Trigger>
          <IconButton variant="ghost" size="2">
            {getIcon()}
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Content>
        <DropdownMenu.Item onClick={() => setTheme('light')}>
          <SunIcon />
          Light
          {theme === 'light' && ' ✓'}
        </DropdownMenu.Item>
        <DropdownMenu.Item onClick={() => setTheme('dark')}>
          <MoonIcon />
          Dark
          {theme === 'dark' && ' ✓'}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onClick={() => setTheme('system')}>
          <Half2Icon />
          System
          {theme === 'system' && ' ✓'}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
