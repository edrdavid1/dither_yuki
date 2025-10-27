interface StatusBarProps {
  status: string;
  imageSize?: string;
}

export const StatusBar = ({ status, imageSize }: StatusBarProps) => {
  return (
    <div className="bg-card border-t-2 border-win95-light px-2 py-1 flex justify-between text-xs">
      <div className="win95-border-inset px-2 py-0.5 flex-1 mr-2">
        {status}
      </div>
      {imageSize && (
        <div className="win95-border-inset px-2 py-0.5">
          {imageSize}
        </div>
      )}
    </div>
  );
};
