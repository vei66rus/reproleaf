<?php
/**
 * Plugin Name: Reproleaf — Blog Link Inventory
 * Description: Analyze published WordPress content locally in the admin workspace and export its link inventory. No frontend output, tracking, automatic edits or forced backlinks.
 * Version: 0.7.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * License: MIT
 */
defined('ABSPATH') || exit;
function reproleaf_label(string $ru,string $en): string {return str_starts_with(get_user_locale(),'ru')?$ru:$en;}
function reproleaf_bound(string $value,int $maximum,string $field): void {
 if(strlen(mb_convert_encoding($value,'UTF-16LE','UTF-8'))/2>$maximum)throw new RuntimeException('Inventory field exceeds the supported limit: '.$field.'. No partial export was produced.');
}
add_action('admin_menu',static function(): void {
 add_management_page('Reproleaf','Reproleaf','edit_others_posts','reproleaf',static function(): void {
  if(!current_user_can('edit_others_posts'))return;
  echo '<div class="wrap"><h1>Reproleaf</h1><p>'.esc_html(reproleaf_label('Выгрузка ссылок из опубликованных статей и страниц для аудита блога. Тексты на сайте не меняются.','Export stored links from published posts and pages for a blog audit. Site content is not changed.')).'</p>';
  echo '<p>'.esc_html(reproleaf_label('Выгрузка не включает приватные и защищённые паролем записи. Меню, виджеты и динамический вывод шорткодов не исполняются и не входят в карту. В текстовом фрагменте сохраняется до 2000 символов. Максимум — 1000 страниц и 5 МБ.','Private and password-protected posts are excluded. Menus, widgets and dynamic shortcode output are not executed or included. Text excerpts contain up to 2000 characters. Maximum: 1000 pages and 5 MiB.')).'</p>';
  echo '<form action="'.esc_url(admin_url('admin-post.php')).'" method="post"><input type="hidden" name="action" value="reproleaf_export">';wp_nonce_field('reproleaf_export');
  echo '<p><label><input type="checkbox" id="reproleaf-include-passages" name="include_passages" value="1"> '.esc_html(reproleaf_label('Включить дополнительные абзацы из сохранённой разметки. До 24 фрагментов по 400 символов на страницу; это не отрендеренная страница. Проверьте содержимое перед передачей другим людям.','Include supplementary paragraphs from stored markup. Up to 24 passages of 400 code points per page; this is not the rendered page. Review the contents before sharing.')).'</label></p>';
  submit_button(reproleaf_label('Скачать карту ссылок JSON','Download link inventory JSON'));echo '</form>';
  echo '<h2>'.esc_html(reproleaf_label('Анализ внутри админки','Analyze inside WordPress')).'</h2><p>'.esc_html(reproleaf_label('Проверьте граф опубликованных страниц прямо здесь. Панель использует локальные файлы плагина и не отправляет выгрузку владельцу Reproleaf.','Review the published-page graph here. The workspace uses bundled plugin files and does not send the inventory to the Reproleaf owner.')).'</p><button type="button" class="button button-primary" id="reproleaf-admin-analyze" disabled>'.esc_html(reproleaf_label('Проверить связи блога','Analyze blog links')).'</button><p id="reproleaf-admin-status" role="status"></p><iframe id="reproleaf-admin-frame" title="Reproleaf workspace" src="'.esc_url(plugins_url('workspace/'.(str_starts_with(get_user_locale(),'ru')?'ru.html':'index.html'),__FILE__)).'" style="display:block;width:100%;height:1100px;border:1px solid #dce0e5;border-radius:12px;background:white;margin-top:20px"></iframe>';
  echo '<p>'.esc_html(reproleaf_label('Загрузите файл в анализатор Reproleaf или передайте его CLI/MCP. Экспорт не отправляется на внешний сервер.','Open the file in Reproleaf or pass it to the CLI/MCP. The export is not sent to an external server.')).'</p></div>';
 });
});
function reproleaf_stored_link_region(DOMNode $node): string {
 $content=false;$header=false;$navigation=false;
 for($parent=$node;$parent;$parent=$parent->parentNode){
  if(!$parent instanceof DOMElement)continue;$tag=strtolower($parent->tagName);$roles=preg_split('/\s+/',strtolower(trim($parent->getAttribute('role'))))?:[];
  $isNavigation=in_array($tag,['nav','footer'],true)||array_intersect($roles,['navigation','banner','contentinfo']);
  if($isNavigation)$navigation=true;
  if(!$isNavigation&&\Reproleaf\StoredPassages\evolkov_crawl_passage_excluded($parent))return 'unknown';
  if(in_array($tag,['main','article'],true)||in_array('main',$roles,true))$content=true;if($tag==='header')$header=true;
 }
 return $navigation||($header&&!$content)?'navigation':($content?'content':'unknown');
}
function reproleaf_inventory(bool $includePassages=false): array {
 if(!class_exists('DOMDocument')||!function_exists('mb_substr'))throw new RuntimeException('PHP DOM and mbstring extensions are required.');
 if($includePassages)require_once __DIR__.'/passage-inventory.php';
 $posts=get_posts(['post_type'=>['post','page'],'post_status'=>'publish','has_password'=>false,'numberposts'=>1001,'orderby'=>'ID','order'=>'ASC','suppress_filters'=>true]);
 if(count($posts)>1000)throw new RuntimeException('Inventory exceeds 1000 pages; prepare a scoped export.');
 $pages=[];$supplementaryBytes=0;
 foreach($posts as $post){
  if($post->post_password!=='')continue;
  if($includePassages&&strlen($post->post_content)>1048576)throw new RuntimeException('Stored markup exceeds the 1 MiB paragraph-parser limit; no partial export was produced.');
  $document=new DOMDocument();$previous=libxml_use_internal_errors(true);
  try{$document->loadHTML('<?xml encoding="UTF-8"><div>'.$post->post_content.'</div>',LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);}finally{libxml_clear_errors();libxml_use_internal_errors($previous);}
  $links=[];foreach($document->getElementsByTagName('a') as $a){$href=$a->getAttribute('href');if($href!==''){reproleaf_bound($href,2048,'href');$link=['href'=>$href,'anchor'=>mb_substr(trim($a->textContent),0,500)];if($includePassages)$link['region']=reproleaf_stored_link_region($a);$links[]=$link;}}
  if(count($links)>1000)throw new RuntimeException('One page exceeds the link limit; no partial link export was produced.');
  $text=wp_strip_all_tags(strip_shortcodes($post->post_content));$page=['url'=>get_permalink($post),'title'=>get_the_title($post),'kind'=>$post->post_type==='post'?'article':'other','text'=>mb_substr($text,0,2000),'textScope'=>'excerpt','links'=>$links];
  reproleaf_bound($page['title'],1000,'title');reproleaf_bound($page['url'],2048,'url');
  if($includePassages){$language=function_exists('pll_get_post_language')?pll_get_post_language($post->ID,'slug'):null;if(is_string($language)){$language=str_replace('_','-',trim($language));if(preg_match('/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iD',$language)){$page['locale']=$language;reproleaf_bound($language,20,'locale');}}}
  else{if(function_exists('pll_get_post_language'))$page['locale']=pll_get_post_language($post->ID)?:get_bloginfo('language');else $page['locale']=get_bloginfo('language');reproleaf_bound($page['locale'],20,'locale');}
  $categories=get_the_category($post->ID);foreach($categories as $category)if($category->slug!=='uncategorized'&&(int)$category->term_id!==(int)get_option('default_category')){$page['cluster']=$category->slug;break;}
  if(isset($page['cluster']))reproleaf_bound($page['cluster'],200,'cluster');
  $focus=get_post_meta($post->ID,'_yoast_wpseo_focuskw',true);if(is_string($focus)&&$focus!==''){reproleaf_bound($focus,300,'primaryQuery');$page['primaryQuery']=$focus;}
  if($includePassages){
   $stored=new DOMDocument();$previous=libxml_use_internal_errors(true);
   try{$loaded=$stored->loadHTML('<?xml encoding="UTF-8"><body><article>'.strip_shortcodes($post->post_content).'</article></body>',LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);}finally{libxml_clear_errors();libxml_use_internal_errors($previous);}
   if(!$loaded)throw new RuntimeException('Could not parse stored paragraph markup; no partial export was produced.');
   $passages=\Reproleaf\StoredPassages\evolkov_crawl_passage_inventory($stored);
   $passages['collectionScope']='Stored published post markup after non-executing shortcode stripping, projected under a synthetic article wrapper; not rendered-page or public-HTML acquisition. Declared contact and interactive subtrees are excluded; no general personal-data detection.';
   $passages=\Reproleaf\StoredPassages\evolkov_crawl_passage_budget($passages,70000);
   if($passages===null)throw new RuntimeException('Paragraph metadata cannot fit its byte limit; no partial export was produced.');$page['passageInventory']=$passages;
   $supplementaryBytes+=strlen(wp_json_encode($page));if($supplementaryBytes>5*1048576)throw new RuntimeException('Inventory exceeds 5 MiB; no partial export was produced.');
  }
  // Stored body headings do not establish the template's rendered H1 count.
  $pages[]=$page;
 }
 $inventory=['schemaVersion'=>1,'siteUrl'=>home_url('/'),'coverage'=>'Published stored post/page content only. Excludes private/password records, navigation, widgets, dynamic shortcodes, JavaScript links and synced-block expansion. Text is an excerpt of up to 2000 characters; no rendered H1 assumption.','pages'=>$pages];
 if($includePassages){$inventory['coverage'].=' Supplementary paragraphs are an explicit optional stored-markup DOM projection under a synthetic article wrapper, not rendered/public-page acquisition. Link regions describe actual stored main/article/nav/header/footer landmarks; absent landmarks remain unknown. Per-post locale is included only when Polylang supplies a known value. No recommendation mode is activated.';foreach([0,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT] as $flags){$json=wp_json_encode($inventory,$flags);if(!$json||strlen($json)>5*1048576)throw new RuntimeException('Inventory exceeds 5 MiB; no partial export was produced.');}}
 return $inventory;
}
add_action('admin_post_reproleaf_export',static function(): void {
 if(!current_user_can('edit_others_posts'))wp_die('Not allowed',403);
 check_admin_referer('reproleaf_export');
 try{$json=wp_json_encode(reproleaf_inventory(($_POST['include_passages']??'')==='1'),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);if(!$json||strlen($json)>5*1024*1024)throw new RuntimeException('Inventory exceeds 5 MiB; prepare a scoped export.');}
 catch(Throwable $error){wp_die(esc_html($error->getMessage()));}
 nocache_headers();header('Content-Type: application/json; charset=utf-8');header('X-Robots-Tag: noindex');header('Content-Disposition: attachment; filename="reproleaf-blog.json"');echo $json;exit;
});

add_action('admin_enqueue_scripts',static function(string $hook): void {if($hook!=='tools_page_reproleaf')return;wp_enqueue_script('reproleaf-admin',plugins_url('admin.js',__FILE__),[], '0.7.0',true);wp_localize_script('reproleaf-admin','reproleafAdmin',['ajaxUrl'=>admin_url('admin-ajax.php'),'nonce'=>wp_create_nonce('reproleaf_analyze'),'language'=>str_starts_with(get_user_locale(),'ru')?'ru':'en']);});
add_action('wp_ajax_reproleaf_analyze',static function(): void {if(!current_user_can('edit_others_posts'))wp_send_json_error(['message'=>'Not allowed'],403);check_ajax_referer('reproleaf_analyze','nonce');try{$data=reproleaf_inventory(($_POST['include_passages']??'')==='1');if(strlen(wp_json_encode($data))>5*1048576)throw new RuntimeException('Inventory exceeds 5 MiB.');wp_send_json_success($data);}catch(Throwable $error){wp_send_json_error(['message'=>$error->getMessage()],400);}});
