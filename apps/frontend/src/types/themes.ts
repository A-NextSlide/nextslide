export interface Typography {
  paragraph: {
    fontFamily: string;
    color: string;
    fontSize?: string;
    fontWeight?: number;
    lineHeight?: number;
  };
  heading?: {
    fontFamily: string;
    color: string;
    fontSize?: string;
    fontWeight?: number;
  };
}

export interface Theme {
  id?: string;
  name: string;
  isCustom?: boolean;
  page: {
    backgroundColor: string;
  };
  typography: Typography;
  accent1: string;
  accent2?: string;
}

export const defaultThemes: Theme[] = [
  {
    id: 'minimal-dark',
    name: 'Minimal Dark',
    page: {
      backgroundColor: '#343A40',
    },
    typography: {
      paragraph: {
        fontFamily: 'Inter',
        color: '#F8F9FA',
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1.6
      },
      heading: {
        fontFamily: 'Inter',
        color: '#F8F9FA',
        fontSize: '32px',
        fontWeight: 700
      }
    },
    accent1: '#6C757D',
    accent2: '#ADB5BD'
  },
  {
    id: 'blue-tech',
    name: 'Blue Tech',
    page: {
      backgroundColor: '#E3F2FD',
    },
    typography: {
      paragraph: {
        fontFamily: 'Roboto',
        color: '#0D47A1',
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1.5
      },
      heading: {
        fontFamily: 'Roboto Mono',
        color: '#0D47A1',
        fontSize: '35px',
        fontWeight: 500
      }
    },
    accent1: '#42A5F5',
    accent2: '#90CAF9'
  },
  {
    id: 'sunny-citrus',
    name: 'Sunny Citrus',
    page: {
      backgroundColor: '#FFF8E1',
    },
    typography: {
      paragraph: {
        fontFamily: 'Lato',
        color: '#E65100',
        fontSize: '17px',
        fontWeight: 400,
        lineHeight: 1.7
      },
      heading: {
        fontFamily: 'Poppins',
        color: '#E65100',
        fontSize: '40px',
        fontWeight: 600
      }
    },
    accent1: '#FFD54F',
    accent2: '#FFB300'
  }
];

export const initialWorkspaceTheme = defaultThemes[0];