export const TableCell: React.FC<{
  first?: boolean | undefined;
  children: React.ReactNode;
}> = ({ first, children }) => {
  return (
    <td className={`py-1 px-3 ${first ? 'border-r border-muted' : ''}`}>
      {children}
    </td>
  );
};
