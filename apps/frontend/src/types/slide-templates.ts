export interface TranslatedSlideComponent {
  id: string;
  type: string; // e.g., "Background", "TiptapTextBlock", "Image"
  props: any; // This will conform to the props in typeboxSchemas for that type
}

export interface TranslatedSlide {
  id: string;
  title: string;
  components: TranslatedSlideComponent[];
}
