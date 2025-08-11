export const TableHead: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <thead>
      <tr className="border-b border-muted">{children}</tr>
    </thead>
  );
};
