<?php
namespace Reproleaf\StoredPassages;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;
use DOMCdataSection;
use RuntimeException;
defined('ABSPATH') || exit;

/** Attribute checks are collection exclusions, not a computed-visibility test. */
function evolkov_crawl_passage_excluded(DOMElement $node): bool {
    $tag=strtolower($node->tagName);
    if(in_array($tag,['script','style','template','noscript','nav','footer','form','address','input','textarea','select','button','label','fieldset','legend','output','datalist','option','optgroup','iframe','object','embed'],true))return true;
    if($node->hasAttribute('hidden')||$node->hasAttribute('inert')||strtolower(trim($node->getAttribute('aria-hidden')))==='true')return true;
    if($node->hasAttribute('contenteditable')&&strtolower(trim($node->getAttribute('contenteditable')))!=='false')return true;
    $roles=preg_split('/\s+/',strtolower(trim($node->getAttribute('role'))))?:[];
    if(array_intersect($roles,['navigation','contentinfo','banner','form','button','textbox','searchbox','combobox','listbox','menu']))return true;
    $style=preg_replace('~/\*.*?\*/~s','',$node->getAttribute('style'))??'';
    $style=preg_replace_callback('/\\\\([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|\\\\([^\r\n\f])/iu',static function(array $match):string{if(($match[1]??'')==='')return $match[2]??'';$code=hexdec($match[1]);return mb_chr($code===0||$code>0x10ffff||($code>=0xd800&&$code<=0xdfff)?0xfffd:$code,'UTF-8');},$style)??'';
    if(preg_match('/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden)\s*(?:!\s*important\s*)?(?:;|$)/i',$style))return true;
    $contactTokens=['contact','contacts','contact-form','contact-details','contact-info','commercial-contact','evolkov-direct-contacts','author-contacts','vcard','h-card','h-adr'];
    $classes=preg_split('/\s+/',strtolower(trim($node->getAttribute('class'))))?:[];
    if(array_intersect($classes,$contactTokens)||in_array(strtolower(trim($node->getAttribute('id'))),$contactTokens,true))return true;
    if($node->hasAttribute('data-evolkov-contact')||$node->hasAttribute('data-contact-form')||$node->hasAttribute('data-contact'))return true;
    $properties=preg_split('/\s+/',strtolower(trim($node->getAttribute('itemprop'))))?:[];
    if(array_intersect($properties,['address','email','telephone']))return true;
    return $tag==='a'&&preg_match('~^(?:mailto|tel|sms):~i',trim($node->getAttribute('href')))===1;
}

/**
 * Offsets address the exact filtered body DOM text-node stream, not raw HTML,
 * rendered CSS text, the first landmark alone or the legacy leading excerpt.
 * No DOM mutation, requests, attribute persistence or database operations.
 */
function evolkov_crawl_passage_inventory(DOMDocument $doc): array {
    $body=$doc->getElementsByTagName('body')->item(0);$offset=0;$streamHash=hash_init('sha256');$landmark=false;$active=null;$rows=[];$eligibleParagraphs=0;$eligibleCharacters=0;$lengthLimited=false;
    $walk=static function(DOMNode $node,bool $inContent=false)use(&$walk,&$offset,$streamHash,&$landmark,&$active,&$rows,&$eligibleParagraphs,&$eligibleCharacters,&$lengthLimited):void{
        if($node instanceof DOMText||$node instanceof DOMCdataSection){$text=$node->nodeValue??'';hash_update($streamHash,$text);$offset+=mb_strlen($text,'UTF-8');if($active!==null)$active['text'].=$text;return;}
        if(!$node instanceof DOMElement)return;
        if(evolkov_crawl_passage_excluded($node))return;
        $tag=strtolower($node->tagName);$roles=preg_split('/\s+/',strtolower(trim($node->getAttribute('role'))))?:[];
        $isLandmark=in_array($tag,['main','article'],true)||in_array('main',$roles,true);if($isLandmark)$landmark=true;$inContent=$inContent||$isLandmark;
        $ownsParagraph=$inContent&&$tag==='p'&&$active===null;
        if($ownsParagraph)$active=['start'=>$offset,'text'=>''];
        foreach($node->childNodes as $child)$walk($child,$inContent);
        if(!$ownsParagraph)return;
        $literal=$active['text'];preg_match('/^\s*/u',$literal,$leading);$text=preg_replace('/^\s+|\s+$/u','',$literal)??'';$start=$active['start']+mb_strlen($leading[0]??'','UTF-8');$active=null;
        $characters=mb_strlen($text,'UTF-8');if($characters===0)return;$eligibleParagraphs++;$eligibleCharacters+=$characters;
        if(count($rows)>=24)return;
        $retained=mb_substr($text,0,400,'UTF-8');$retainedCharacters=mb_strlen($retained,'UTF-8');$truncated=$retainedCharacters<$characters;if($truncated)$lengthLimited=true;
        $rows[]=['ordinal'=>$eligibleParagraphs,'start'=>$start,'end'=>$start+$retainedCharacters,'text'=>$retained,'originalCharacters'=>$characters,'truncated'=>$truncated];
    };
    if($body)$walk($body);
    $reasons=[];if(!$landmark)$reasons[]='no-content-landmark';if($eligibleParagraphs===0)$reasons[]='no-eligible-paragraphs';if($eligibleParagraphs>24)$reasons[]='passage-count';if($lengthLimited)$reasons[]='passage-length';
    $inventory=['schemaVersion'=>1,'method'=>'filtered-dom-paragraphs-v1','offsetUnit'=>'unicode-code-points','offsetBase'=>0,'endExclusive'=>true,'ordinalBase'=>1,'offsetReference'=>'filtered-body-dom-text-content','documentCharacters'=>$offset,'documentTextSha256'=>hash_final($streamHash),'contentLandmarkDetected'=>$landmark,'eligibleParagraphs'=>$eligibleParagraphs,'passages'=>$rows,'limits'=>['passages'=>24,'charactersPerPassage'=>400,'textCharacters'=>9600,'serializedBytes'=>70000],'coverage'=>['scope'=>'eligible-content-paragraphs-only','eligibleCharacters'=>$eligibleCharacters,'paragraphsCaptured'=>0,'paragraphsOmitted'=>$eligibleParagraphs,'charactersCaptured'=>0,'charactersOmitted'=>$eligibleCharacters,'complete'=>false,'truncated'=>false,'reasons'=>$reasons],'visibilityScope'=>'HTML hidden/aria-hidden/inert attributes and inline CSS only; external and computed CSS are not inspected.','collectionScope'=>'Public body DOM text with declared contact and interactive subtrees excluded; no general personal-data detection.'];
    // The normal ceiling always fits metadata. The nullable budget helper also
    // supports the much smaller remaining legacy-inventory byte allowance.
    $bounded=evolkov_crawl_passage_budget($inventory,70000);
    if($bounded===null)throw new RuntimeException('Passage metadata exceeds its fixed byte allowance.');
    return $bounded;
}

/** Preserve legacy fields: nullable means metadata cannot fit, not complete. */
function evolkov_crawl_passage_budget(array $inventory,int $byteBudget): ?array {
    $byteBudget=max(0,min(70000,$byteBudget));$available=$inventory['passages'];$availableCharacters=array_sum(array_map(static fn(array $row):int=>mb_strlen($row['text'],'UTF-8'),$available));
    $render=static function(int $characterLimit,bool $byteLimited)use($inventory,$available,$byteBudget):array{
        $result=$inventory;$result['limits']['serializedBytes']=$byteBudget;$result['passages']=[];$captured=0;
        foreach($available as $row){$characters=min(mb_strlen($row['text'],'UTF-8'),max(0,$characterLimit-$captured));if($characters===0)break;$row['text']=mb_substr($row['text'],0,$characters,'UTF-8');$row['end']=$row['start']+$characters;$row['truncated']=$characters<$row['originalCharacters'];$result['passages'][]=$row;$captured+=$characters;}
        $coverage=&$result['coverage'];$coverage['paragraphsCaptured']=count($result['passages']);$coverage['paragraphsOmitted']=$result['eligibleParagraphs']-$coverage['paragraphsCaptured'];$coverage['charactersCaptured']=$captured;$coverage['charactersOmitted']=$coverage['eligibleCharacters']-$captured;
        $coverage['truncated']=$coverage['paragraphsOmitted']>0||$coverage['charactersOmitted']>0;
        $coverage['complete']=$result['contentLandmarkDetected']&&$result['eligibleParagraphs']>0&&!$coverage['truncated'];
        if($byteLimited&&!in_array('byte-budget',$coverage['reasons'],true))$coverage['reasons'][]='byte-budget';
        return $result;
    };
    $full=$render($availableCharacters,false);if(strlen(wp_json_encode($full))<=$byteBudget)return $full;
    $empty=$render(0,true);if(strlen(wp_json_encode($empty))>$byteBudget)return null;
    $low=0;$high=$availableCharacters;$best=$empty;
    while($low<=$high){$middle=intdiv($low+$high,2);$candidate=$render($middle,true);if(strlen(wp_json_encode($candidate))<=$byteBudget){$best=$candidate;$low=$middle+1;}else $high=$middle-1;}
    return $best;
}
