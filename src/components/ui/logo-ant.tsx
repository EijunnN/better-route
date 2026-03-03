export const LogoAnt = ({ className }: { className?: string }) => {
    return (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 100 100" 
        fill="none"
        className={className} // Permite ajustar tamaño con clases de Tailwind (ej: w-12 h-12)
      >
        {/* Patas traseras y delanteras: Usan 'currentColor' o variable foreground */}
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-60">
           <path d="M50 50 L 35 30" />
           <path d="M50 50 L 65 30" />
           <path d="M50 50 L 35 70" />
           <path d="M50 50 L 65 70" />
        </g>
  
        {/* Conexión central */}
        <path d="M25 50 L 75 50" className="stroke-primary" strokeWidth="4"/>
  
        {/* Cuerpo: Nodos */}
        <circle cx="25" cy="50" r="11" className="fill-primary" />
        
        {/* Tórax: Hueco para dar estilo tecnológico */}
        <circle cx="50" cy="50" r="8" className="fill-background stroke-primary" strokeWidth="3"/>
        
        {/* Cabeza */}
        <circle cx="75" cy="50" r="10" className="fill-primary" />
  
        {/* Antenas */}
        <path d="M75 50 L 88 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M75 50 L 88 62" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        
        {/* Ojo / Destello */}
        <circle cx="78" cy="47" r="2" className="fill-background"/>
      </svg>
    );
  };