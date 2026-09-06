export default function Loading() {
  return (
    <div className="route-loading" aria-label="Memuat data">
      <div className="skeleton hero-line" />
      <div className="skeleton-grid">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="skeleton card-block" />)}
      </div>
      <div className="skeleton wide-block" />
    </div>
  );
}
