export const Input = ({
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement => {
  return (
    <input
      className="flex items-center h-9 px-3 rounded border border-border-default text-sm bg-background-default text-text-default transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default flex-1"
      {...props}
    />
  );
};
