import { useEffect, useState } from "react";
import api from "../api/client";

export default function ReaderSidebar({ toc, documentId }) {
  const [annotations, setAnnotations] = useState([]);

  useEffect(() => {
    api
      .get(`/documents/${documentId}/annotations`)
      .then(res => setAnnotations(res.data));
  }, [documentId]);

  return (
    <div className="reader-sidebar">
      <section>
        <h3>Contents</h3>
        {toc.map((item, i) => (
          <div key={i}>{item.title}</div>
        ))}
      </section>

      <section>
        <h3>Highlights & Notes</h3>
        {annotations.map(a => (
          <div key={a.id} className="note-item">
            <small>Page {a.pageNumber}</small>
            <p>{a.selectedText}</p>
            {a.note && <em>{a.note}</em>}
          </div>
        ))}
      </section>
    </div>
  );
}
