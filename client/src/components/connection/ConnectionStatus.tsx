import { cn } from '@/lib/utils';

interface Props {
  status: 'connected' | 'disconnected' | 'error';
  className?: string;
}

export function ConnectionStatus({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'connected' && 'bg-green-500',
        status === 'disconnected' && 'bg-gray-400',
        status === 'error' && 'bg-red-500',
        className
      )}
    />
  );
}
