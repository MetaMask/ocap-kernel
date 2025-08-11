export const Table: React.FC<{
  dataTestid?: string;
  children: React.ReactNode;
}> = ({ dataTestid, children }) => {
  return (
    <table
      data-testid={dataTestid}
      className="w-full border-collapse border-t border-muted"
    >
      {children}
    </table>
  );
};
