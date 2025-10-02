import React, { useMemo, useState } from 'react';
import { ComponentInstance } from '@/types/components';
import EnhancedColorPicker from '../EnhancedColorPicker';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import * as LucideIcons from 'lucide-react';
import * as HeroIcons from '@heroicons/react/24/outline';
import * as HeroIconsSolid from '@heroicons/react/24/solid';
import * as TablerIcons from '@tabler/icons-react';
import * as FeatherIcons from 'react-feather';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface IconSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (updates: Record<string, any>) => void;
  handlePropChange: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
}

// Icon categories with regex patterns
const ICON_CATEGORIES = {
  'All': { pattern: /.*/, icon: 'Grid3x3' },
  'Interface': { pattern: /arrow|chevron|menu|close|x|plus|minus|check|dot|more|settings|edit|trash|delete|copy|paste|cut|save|download|upload|refresh|reload|sync|undo|redo|forward|back|up|down|left|right|expand|collapse|maximize|minimize|fullscreen|exit|logout|login|lock|unlock|key|search|filter|sort|drag|move|resize|rotate|flip|align|distribute|group|ungroup|merge|split|link|unlink|attach|detach|pin|unpin|bookmark|flag|tag|label|badge|notification|bell|alert|warning|error|info|help|question|exclamation/i, icon: 'MousePointer' },
  'Media': { pattern: /image|photo|picture|camera|video|film|movie|music|audio|sound|microphone|speaker|volume|play|pause|stop|record|skip|next|previous|forward|backward|repeat|shuffle|playlist|album|podcast|radio|tv|broadcast|stream|live|media/i, icon: 'Image' },
  'Files': { pattern: /file|folder|document|page|sheet|slide|presentation|spreadsheet|database|archive|zip|download|upload|cloud|drive|storage|backup|sync|share|export|import|print|scan|fax|envelope|mail|email|message|chat|comment|note|sticky|clipboard|paperclip|attachment/i, icon: 'File' },
  'Charts': { pattern: /chart|graph|plot|diagram|analytics|statistics|data|report|dashboard|metric|measure|trend|growth|decline|increase|decrease|performance|progress|gauge|meter|score|rating|rank|comparison|correlation|distribution|visualization/i, icon: 'BarChart' },
  'Communication': { pattern: /mail|email|message|chat|comment|conversation|discussion|forum|thread|reply|forward|send|receive|inbox|outbox|draft|spam|trash|phone|call|contact|address|user|person|people|group|team|community|social|share|like|heart|star|favorite|bookmark|follow|subscribe|notification|bell|alert|announce|broadcast|megaphone|speaker/i, icon: 'MessageCircle' },
  'Technology': { pattern: /computer|laptop|desktop|mobile|tablet|phone|device|hardware|software|app|application|program|code|programming|development|terminal|console|command|script|function|variable|database|server|cloud|network|internet|wifi|bluetooth|usb|cable|port|connection|api|integration|plugin|extension|module|package|library|framework|tool|utility|service|platform|system|process|task|job|queue|stack|heap|memory|storage|disk|cpu|gpu|ram|processor|chip|circuit|board|component|element|node|edge|vertex|graph|tree|list|array|matrix|vector|tensor|algorithm|machine|learning|ai|artificial|intelligence|neural|network|deep|model|train|test|validate|predict|classify|cluster|regression|classification|supervised|unsupervised|reinforcement/i, icon: 'Cpu' },
  'Business': { pattern: /business|work|office|company|organization|enterprise|corporate|professional|career|job|employment|hire|recruit|interview|resume|portfolio|project|task|deadline|schedule|calendar|meeting|conference|presentation|report|document|contract|agreement|deal|negotiation|sale|purchase|order|invoice|receipt|payment|transaction|money|dollar|currency|finance|accounting|budget|expense|income|revenue|profit|loss|investment|stock|share|market|trade|exchange|economy|industry|sector|vertical|horizontal|strategy|plan|goal|objective|target|milestone|achievement|success|failure|risk|opportunity|challenge|solution|innovation|improvement|optimization|efficiency|productivity|performance|quality|standard|compliance|regulation|policy|procedure|process|workflow|operation|management|leadership|team|collaboration|communication|feedback|review|evaluation|assessment|analysis|insight|decision|action|implementation|execution|delivery|result|outcome|impact|value|benefit|advantage|disadvantage|strength|weakness|threat|competitor|partner|customer|client|user|stakeholder|investor|shareholder|board|executive|manager|employee|staff|human|resource|talent|skill|competency|training|development|growth|promotion|compensation|benefit|incentive|motivation|engagement|satisfaction|retention|turnover|culture|environment|workspace|facility|equipment|supply|inventory|logistics|distribution|delivery|shipping|transport|import|export|global|international|local|regional|national|market|segment|demographic|psychographic|behavioral|geographic|target|audience|persona|journey|experience|touchpoint|channel|campaign|advertising|marketing|branding|identity|logo|slogan|message|content|creative|design|visual|graphic|illustration|photography|video|animation|motion|interactive|digital|online|offline|print|media|social|network|platform|website|app|mobile|desktop|tablet|responsive|adaptive|accessibility|usability|interface|navigation|layout|structure|hierarchy|taxonomy|category|tag|label|metadata|search|filter|sort|rank|recommend|personalize|customize|configure|setting|preference|option|feature|function|capability|integration|api|webhook|plugin|extension|addon|module|component|widget|element|block|section|page|screen|view|state|action|event|trigger|condition|rule|logic|algorithm|formula|calculation|computation|processing|transformation|conversion|migration|backup|restore|recovery|security|privacy|authentication|authorization|permission|role|access|control|audit|log|monitor|alert|notification|report|dashboard|metric|kpi|okr|goal|target|benchmark|baseline|threshold|limit|range|scale|score|rating|ranking|comparison|correlation|causation|regression|prediction|forecast|projection|scenario|simulation|model|hypothesis|experiment|test|validation|verification|confirmation|proof|evidence|data|information|knowledge|insight|wisdom|learning|education|training|certification|qualification|credential|degree|diploma|certificate|license|accreditation|standard|framework|methodology|approach|technique|tool|resource|asset|property|intellectual|patent|trademark|copyright|license|agreement|contract|terms|condition|policy|disclaimer|warranty|guarantee|liability|indemnity|insurance|risk|compliance|regulation|law|legal|judicial|court|judge|jury|lawyer|attorney|counsel|advice|consultation|representation|litigation|dispute|resolution|arbitration|mediation|negotiation|settlement|judgment|verdict|sentence|penalty|fine|damage|compensation|remedy|relief|injunction|order|decree|ruling|decision|opinion|precedent|case|matter|issue|question|problem|challenge|opportunity|solution|alternative|option|choice|preference|priority|criteria|factor|variable|parameter|attribute|characteristic|feature|quality|property|aspect|dimension|perspective|viewpoint|angle|approach|method|way|means|mode|style|manner|form|format|type|kind|sort|category|class|group|set|collection|series|sequence|order|arrangement|organization|structure|system|framework|model|pattern|template|example|sample|instance|case|scenario|situation|context|environment|condition|state|status|stage|phase|step|process|procedure|protocol|guideline|instruction|direction|guidance|advice|tip|hint|suggestion|recommendation|best|practice|standard|benchmark|reference|source|resource|tool|utility|helper|assistant|support|service|help|documentation|manual|guide|tutorial|lesson|course|curriculum|syllabus|module|unit|chapter|section|topic|subject|theme|concept|idea|principle|theory|hypothesis|assumption|premise|conclusion|inference|deduction|induction|reasoning|logic|argument|proof|evidence|fact|truth|reality|perception|belief|opinion|perspective|viewpoint|attitude|mindset|philosophy|ideology|doctrine|dogma|creed|faith|religion|spirituality|ethics|morality|value|virtue|principle|standard|norm|rule|law|code|conduct|behavior|action|activity|practice|habit|custom|tradition|culture|society|community|group|organization|institution|establishment|system|structure|hierarchy|order|authority|power|control|influence|leadership|management|governance|administration|bureaucracy|democracy|republic|monarchy|dictatorship|totalitarian|authoritarian|liberal|conservative|progressive|radical|moderate|centrist|left|right|wing|party|political|election|vote|campaign|candidate|office|position|role|responsibility|duty|obligation|right|privilege|freedom|liberty|justice|equality|fairness|equity|diversity|inclusion|representation|participation|engagement|involvement|contribution|impact|effect|consequence|result|outcome|implication|significance|importance|relevance|meaning|purpose|goal|objective|aim|target|mission|vision|strategy|plan|tactic|action|initiative|program|project|activity|task|assignment|job|work|effort|endeavor|undertaking|venture|enterprise|business|company|corporation|firm|organization|association|society|club|group|team|committee|board|council|commission|agency|department|division|unit|branch|office|bureau|institute|institution|establishment|foundation|trust|charity|nonprofit|ngo|government|public|private|sector|industry|field|domain|area|region|zone|territory|jurisdiction|authority|power|control|regulation|law|rule|policy|procedure|protocol|standard|guideline|principle|criterion|measure|metric|indicator|index|ratio|rate|percentage|proportion|fraction|decimal|number|figure|statistic|data|information|fact|evidence|proof|support|justification|reason|rationale|explanation|clarification|interpretation|analysis|evaluation|assessment|judgment|opinion|view|perspective|stance|position|attitude|belief|value|principle|ethic|moral|virtue|character|integrity|honesty|trust|loyalty|commitment|dedication|devotion|passion|enthusiasm|motivation|inspiration|aspiration|ambition|goal|dream|vision|hope|faith|confidence|courage|strength|resilience|perseverance|determination|persistence|patience|discipline|focus|concentration|attention|awareness|mindfulness|consciousness|understanding|comprehension|knowledge|wisdom|insight|intuition|instinct|sense|feeling|emotion|mood|sentiment|affection|love|care|compassion|empathy|sympathy|kindness|generosity|gratitude|appreciation|respect|admiration|esteem|regard|honor|dignity|pride|humility|modesty|simplicity|elegance|beauty|grace|charm|appeal|attraction|magnetism|charisma|presence|aura|energy|vitality|vigor|strength|power|force|intensity|passion|fire|heat|warmth|light|brightness|radiance|glow|sparkle|shine|glitter|shimmer|twinkle|flash|flicker|flame|blaze|burn|ignite|kindle|fuel|feed|sustain|maintain|preserve|protect|defend|guard|shield|armor|fortress|wall|barrier|fence|gate|door|window|opening|entrance|exit|passage|pathway|route|road|street|avenue|boulevard|highway|freeway|bridge|tunnel|intersection|crossroad|junction|fork|branch|division|split|separation|distinction|difference|contrast|comparison|similarity|likeness|resemblance|correspondence|correlation|connection|relation|relationship|association|link|bond|tie|attachment|affinity|attraction|magnetism|gravity|pull|draw|appeal|charm|allure|fascination|intrigue|interest|curiosity|wonder|amazement|astonishment|surprise|shock|awe|admiration|respect|reverence|worship|devotion|dedication|commitment|loyalty|faithfulness|fidelity|trust|confidence|belief|faith|hope|optimism|positivity|enthusiasm|excitement|joy|happiness|pleasure|delight|satisfaction|contentment|fulfillment|gratification|enjoyment|fun|entertainment|amusement|recreation|leisure|relaxation|rest|peace|tranquility|serenity|calm|quiet|silence|stillness|stability|balance|harmony|symmetry|proportion|ratio|scale|measure|dimension|size|magnitude|extent|scope|range|span|breadth|width|length|height|depth|thickness|density|weight|mass|volume|capacity|quantity|amount|number|count|total|sum|aggregate|collection|accumulation|concentration|focus|center|core|heart|essence|substance|matter|material|element|component|ingredient|constituent|part|piece|fragment|segment|section|portion|share|fraction|percentage|ratio|proportion|rate|speed|velocity|acceleration|momentum|force|energy|power|strength|intensity|magnitude|amplitude|frequency|wavelength|period|cycle|phase|stage|step|level|degree|grade|rank|order|sequence|series|progression|evolution|development|growth|expansion|increase|rise|climb|ascent|peak|summit|top|apex|zenith|pinnacle|height|maximum|optimum|best|ideal|perfect|excellent|outstanding|exceptional|extraordinary|remarkable|notable|significant|important|crucial|critical|essential|vital|necessary|required|mandatory|obligatory|compulsory|optional|voluntary|discretionary|flexible|adaptable|adjustable|variable|changeable|modifiable|customizable|configurable|programmable|controllable|manageable|maintainable|sustainable|renewable|recyclable|reusable|efficient|effective|productive|profitable|beneficial|advantageous|favorable|positive|good|great|wonderful|amazing|awesome|fantastic|terrific|superb|magnificent|splendid|marvelous|fabulous|incredible|unbelievable|astonishing|astounding|stunning|breathtaking|spectacular|impressive|striking|remarkable|notable|noteworthy|significant|meaningful|valuable|precious|priceless|invaluable|irreplaceable|unique|special|rare|scarce|limited|exclusive|premium|luxury|deluxe|elite|superior|supreme|ultimate|extreme|radical|revolutionary|innovative|creative|original|novel|fresh|new|modern|contemporary|current|latest|recent|updated|upgraded|improved|enhanced|advanced|sophisticated|complex|complicated|intricate|elaborate|detailed|thorough|comprehensive|complete|full|total|entire|whole|all|every|each|any|some|few|several|many|multiple|numerous|countless|infinite|endless|eternal|permanent|lasting|enduring|durable|stable|steady|constant|consistent|continuous|ongoing|persistent|sustained|maintained|preserved|protected|secured|safe|sound|solid|strong|robust|sturdy|tough|hard|firm|rigid|stiff|tight|tense|stressed|strained|stretched|extended|expanded|enlarged|increased|grown|developed|evolved|progressed|advanced|improved|enhanced|upgraded|updated|modernized|revolutionized|transformed|changed|altered|modified|adjusted|adapted|customized|personalized|individualized|specialized|focused|targeted|directed|aimed|intended|designed|planned|organized|structured|systematic|methodical|logical|rational|reasonable|sensible|practical|pragmatic|realistic|feasible|viable|possible|probable|likely|expected|anticipated|predicted|projected|forecasted|estimated|calculated|computed|measured|quantified|qualified|certified|verified|validated|confirmed|proven|tested|tried|experienced|skilled|expert|professional|specialist|master|genius|talented|gifted|capable|competent|qualified|certified|licensed|authorized|permitted|allowed|enabled|empowered|equipped|prepared|ready|set|go/i, icon: 'Briefcase' },
  'Nature': { pattern: /nature|natural|environment|ecology|ecosystem|habitat|wildlife|animal|bird|fish|insect|plant|tree|flower|leaf|grass|forest|jungle|woods|mountain|hill|valley|river|lake|ocean|sea|beach|island|desert|prairie|savanna|tundra|arctic|tropical|climate|weather|season|spring|summer|autumn|fall|winter|sun|moon|star|planet|earth|sky|cloud|rain|snow|wind|storm|thunder|lightning|rainbow|sunrise|sunset|dawn|dusk|day|night|light|dark|shadow|shade/i, icon: 'Trees' },
  'Objects': { pattern: /object|thing|item|article|piece|tool|instrument|device|gadget|widget|machine|equipment|apparatus|appliance|fixture|furniture|table|chair|desk|bed|sofa|couch|cabinet|shelf|drawer|closet|wardrobe|door|window|wall|floor|ceiling|roof|house|home|building|structure|architecture|design|style|fashion|clothing|apparel|garment|outfit|dress|shirt|pants|shoes|accessories|jewelry|watch|glasses|bag|purse|wallet|luggage|suitcase|backpack|box|container|package|parcel|gift|present|toy|game|sport|ball|bat|racket|club|stick|board|card|dice|puzzle|book|magazine|newspaper|journal|diary|notebook|paper|pen|pencil|marker|crayon|brush|paint|canvas|frame|picture|photo|portrait|landscape|sculpture|statue|monument|memorial|trophy|medal|award|prize|certificate|diploma|degree|badge|emblem|logo|symbol|sign|flag|banner|poster|billboard|advertisement|announcement|notice|warning|caution|danger|hazard|risk|threat|emergency|crisis|disaster|accident|incident|event|occasion|celebration|party|festival|holiday|ceremony|ritual|tradition|custom|culture|heritage|history|past|present|future|time|clock|watch|calendar|date|day|week|month|year|decade|century|millennium|era|age|period|epoch|moment|instant|second|minute|hour|morning|afternoon|evening|night|midnight|noon|dawn|dusk|sunrise|sunset|twilight|season|spring|summer|autumn|fall|winter|weather|climate|temperature|hot|cold|warm|cool|mild|moderate|extreme|severe|harsh|gentle|soft|smooth|rough|sharp|dull|bright|dark|light|heavy|thick|thin|wide|narrow|long|short|tall|high|low|deep|shallow|big|large|small|tiny|huge|giant|massive|enormous|gigantic|colossal|immense|vast|spacious|compact|dense|sparse|full|empty|solid|liquid|gas|vapor|smoke|steam|mist|fog|haze|dust|dirt|mud|sand|gravel|stone|rock|boulder|pebble|crystal|gem|jewel|diamond|gold|silver|bronze|copper|iron|steel|metal|alloy|plastic|rubber|leather|fabric|cloth|textile|wool|cotton|silk|linen|canvas|paper|cardboard|wood|timber|lumber|bamboo|glass|ceramic|porcelain|clay|brick|concrete|cement|mortar|plaster|paint|varnish|polish|wax|oil|grease|lubricant|fuel|gasoline|diesel|electricity|battery|power|energy|force|strength|weakness|fragility|brittleness|flexibility|elasticity|plasticity|hardness|softness|smoothness|roughness|texture|pattern|design|shape|form|figure|outline|silhouette|profile|contour|edge|corner|angle|curve|arc|circle|oval|ellipse|square|rectangle|triangle|polygon|star|cross|plus|minus|equal|multiply|divide|percent|degree|temperature|weight|mass|volume|density|pressure|speed|velocity|acceleration|distance|length|width|height|depth|area|perimeter|circumference|diameter|radius|angle|degree|radian|sine|cosine|tangent|logarithm|exponent|root|square|cube|power|factorial|permutation|combination|probability|statistics|average|mean|median|mode|range|deviation|variance|correlation|regression|distribution|normal|standard|error|confidence|interval|hypothesis|test|significance|p-value|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega/i, icon: 'Package' },
  'Symbols': { pattern: /symbol|sign|icon|logo|emblem|badge|flag|marker|indicator|pointer|cursor|caret|asterisk|hash|pound|dollar|percent|ampersand|at|copyright|trademark|registered|degree|infinity|pi|sigma|delta|alpha|beta|gamma|omega|plus|minus|multiply|divide|equal|not|greater|less|approximately|therefore|because|exists|forall|element|subset|union|intersection|empty|null|undefined/i, icon: 'Hash' }
};

// Get all icon names from all libraries merged - optimized version
const getAllIcons = () => {
  const icons: { name: string; library: string; Component: any }[] = [];
  
  // Add Lucide icons
  Object.keys(LucideIcons).forEach(key => {
    if (
      key !== 'default' && key !== 'icons' && key !== 'createLucideIcon' &&
      !key.endsWith('Icon')
    ) {
      const exportValue = LucideIcons[key as keyof typeof LucideIcons] as any;
      const isRenderable = typeof exportValue === 'object' || typeof exportValue === 'function';
      if (isRenderable) {
        icons.push({
          name: key,
          library: 'lucide',
          Component: exportValue
        });
      }
    }
  });

  // Add Hero icons (outline)
  Object.keys(HeroIcons).forEach(key => {
    if (key !== 'default') {
      const exportValue = HeroIcons[key as keyof typeof HeroIcons] as any;
      const isRenderable = typeof exportValue === 'object' || typeof exportValue === 'function';
      if (isRenderable) {
        icons.push({
          name: key.replace(/Icon$/, ''),
          library: 'heroicons',
          Component: exportValue
        });
      }
    }
  });

  // Add Tabler icons
  Object.keys(TablerIcons).forEach(key => {
    if (key !== 'default' && key.startsWith('Icon')) {
      const exportValue = TablerIcons[key as keyof typeof TablerIcons] as any;
      const isRenderable = typeof exportValue === 'object' || typeof exportValue === 'function';
      if (isRenderable) {
        icons.push({
          name: key.replace(/^Icon/, ''),
          library: 'tabler',
          Component: exportValue
        });
      }
    }
  });

  // Add Feather icons
  Object.keys(FeatherIcons).forEach(key => {
    if (key !== 'default') {
      const exportValue = FeatherIcons[key as keyof typeof FeatherIcons] as any;
      const isRenderable = typeof exportValue === 'object' || typeof exportValue === 'function';
      if (isRenderable) {
        icons.push({
          name: key,
          library: 'feather',
          Component: exportValue
        });
      }
    }
  });

  return icons;
};

// Memoize the icons list to prevent recalculation on every render
let cachedIcons: ReturnType<typeof getAllIcons> | null = null;
const getMemoizedIcons = () => {
  if (!cachedIcons) {
    cachedIcons = getAllIcons();
  }
  return cachedIcons;
};

export const IconSettingsEditor: React.FC<IconSettingsEditorProps> = ({
  component,
  onUpdate,
  handlePropChange,
  saveComponentToHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [displayCount, setDisplayCount] = useState(200);
  
  // Use useMemo to ensure these values are reactive to prop changes
  const { iconLibrary, iconName, color, strokeWidth, opacity } = useMemo(() => ({
    iconLibrary: component.props.iconLibrary || 'lucide',
    iconName: component.props.iconName || 'Star',
    color: component.props.color || '#000000',
    strokeWidth: component.props.strokeWidth || 2,
    opacity: component.props.opacity || 1
  }), [component.props]);
  
  // Get all icons merged from all libraries - use memoized version
  const allIcons = useMemo(() => getMemoizedIcons(), []);
  
  // Filter icons by category and search
  const filteredIcons = useMemo(() => {
    let icons = allIcons;
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      icons = icons.filter(icon => 
        icon.name.toLowerCase().includes(query)
      );
    }
    
    // Filter by category only if no search query
    if (!searchQuery && selectedCategory !== 'All') {
      const categoryPattern = ICON_CATEGORIES[selectedCategory as keyof typeof ICON_CATEGORIES]?.pattern;
      if (categoryPattern) {
        icons = icons.filter(icon => categoryPattern.test(icon.name));
      }
    }
    
    return icons;
  }, [allIcons, searchQuery, selectedCategory]);

  // Get paginated icons
  const displayedIcons = useMemo(() => {
    return filteredIcons.slice(0, displayCount);
  }, [filteredIcons, displayCount]);

  const handleIconSelect = (icon: typeof allIcons[0]) => {
    // Update both icon name and library at once
    onUpdate({
      iconName: icon.name,
      iconLibrary: icon.library
    });
    saveComponentToHistory(`Changed icon to ${icon.name}`);
  };

  const currentIcon = allIcons.find(icon => 
    icon.name === iconName && icon.library === iconLibrary
  );

  // Handle search change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Reset to "All" category when searching
    if (value) {
      setSelectedCategory('All');
    }
    // Reset display count when searching
    setDisplayCount(200);
  };

  const loadMore = () => {
    setDisplayCount(prev => prev + 200);
  };

  return (
    <div className="space-y-4">
      {/* Current Icon Display */}
      <div className="flex items-center gap-3 p-3 bg-secondary/20 rounded-lg">
        {currentIcon && (
          <div className="w-12 h-12 flex items-center justify-center bg-background rounded-md border" key={`${currentIcon.library}-${currentIcon.name}`}>
            {iconLibrary === 'heroicons' ? (
              <currentIcon.Component width={28} height={28} stroke={color} fill="none" />
            ) : (
              <currentIcon.Component
                size={28}
                color={color}
                strokeWidth={iconLibrary === 'lucide' || iconLibrary === 'tabler' || iconLibrary === 'feather' ? strokeWidth : undefined}
              />
            )}
          </div>
        )}
        <div className="flex-1">
          <div className="text-sm font-medium">{iconName}</div>
          <div className="text-xs text-muted-foreground capitalize">{iconLibrary}</div>
        </div>
      </div>

      {/* Search */}
      <div>
        <Input
          placeholder="Search all icons..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full h-8"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className="w-max flex h-auto p-1 gap-1 justify-start">
            {Object.entries(ICON_CATEGORIES).map(([category, config]) => {
              const IconComponent = LucideIcons[config.icon as keyof typeof LucideIcons] as any;
              return (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="flex items-center gap-1 px-2 py-1 text-xs whitespace-nowrap"
                  disabled={!!searchQuery && category !== 'All'}
                >
                  {IconComponent && <IconComponent size={12} />}
                  <span>{category}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Icon Grid */}
        <TabsContent value={selectedCategory} className="mt-3">
          <ScrollArea className="h-[280px] w-full rounded-md border">
            <div className="p-2">
              <div className="grid grid-cols-8 gap-1">
                <TooltipProvider delayDuration={200}>
                  {displayedIcons.map((icon, index) => {
                    const isSelected = currentIcon?.name === icon.name && currentIcon?.library === icon.library;
                    return (
                      <Tooltip key={`${icon.library}-${icon.name}-${index}`}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleIconSelect(icon)}
                            className={cn(
                              "w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors",
                              isSelected && "bg-accent border-2 border-primary"
                            )}
                          >
                            {icon.library === 'heroicons' ? (
                              <icon.Component width={18} height={18} className="text-foreground" />
                            ) : (
                              <icon.Component
                                size={18}
                                className="text-foreground"
                                strokeWidth={1.5}
                              />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-medium">{icon.name}</span>
                          <span className="text-[10px] text-muted-foreground">{icon.library}</span>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              </div>
              
              {/* Load More Button */}
              {displayedIcons.length < filteredIcons.length && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Load {Math.min(200, filteredIcons.length - displayedIcons.length)} more icons
                    ({filteredIcons.length - displayedIcons.length} remaining)
                  </button>
                </div>
              )}
              
              {displayedIcons.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No icons found
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Showing {displayedIcons.length} of {filteredIcons.length} icons
          </div>
        </TabsContent>
      </Tabs>

      {/* Icon Properties */}
      <div className="space-y-3 pt-2 border-t">
        {/* Color */}
        <div className="space-y-1.5">
          <Label className="text-xs">Color</Label>
          <EnhancedColorPicker
            color={color}
            onChange={(newColor: string) => {
              handlePropChange('color', newColor, true);
              saveComponentToHistory('Changed icon color');
            }}
          />
        </div>

        {/* Stroke Width */}
        {(iconLibrary === 'lucide' || iconLibrary === 'tabler' || iconLibrary === 'feather') && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Stroke Width</Label>
              <span className="text-xs text-muted-foreground">{strokeWidth}</span>
            </div>
            <Slider
              value={[strokeWidth]}
              onValueChange={([value]) => {
                handlePropChange('strokeWidth', value, true);
                saveComponentToHistory('Changed stroke width');
              }}
              min={0.5}
              max={4}
              step={0.5}
              className="w-full"
            />
          </div>
        )}

        {/* Opacity */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Opacity</Label>
            <span className="text-xs text-muted-foreground">{Math.round(opacity * 100)}%</span>
          </div>
          <Slider
            value={[opacity]}
            onValueChange={([value]) => {
              handlePropChange('opacity', value, true);
              saveComponentToHistory('Changed opacity');
            }}
            min={0}
            max={1}
            step={0.1}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default IconSettingsEditor; 