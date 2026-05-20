export function UserMessageContent({ content, attachments = [] }) {
  return (
    <div>
      {content ? <p className="cia-user-text">{content}</p> : null}
      {attachments.length > 0 ? (
        <ul className="cia-message-attachments">
          {attachments.map((file) => (
            <li key={file.name}>📎 {file.name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
