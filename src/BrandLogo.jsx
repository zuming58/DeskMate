export function BrandLogo({ alt = 'DeskMate' }) {
  return <img className="brand-logo" src={`${import.meta.env.BASE_URL}assets/branding/deskmate-logo.png`} alt={alt} draggable="false" />;
}
