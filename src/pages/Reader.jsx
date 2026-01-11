import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PdfViewer from "../reader/PdfViewer";
import api from "../api/client";
import "../styles/reader.css";

export default function Reader() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    api.get(`/documents/${id}/reader-state`)
      .then(res => setDoc(res.data));
  }, [id]);

  if (!doc) return <div>Loading document…</div>;

  return (
    <div className="reader-layout">
      <PdfViewer
        documentId={id}
        startPage={doc.resume?.pageNumber || 1}
      />
    </div>
  );
}
