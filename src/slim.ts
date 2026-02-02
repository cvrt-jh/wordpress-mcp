/**
 * Response slimming - reduce WordPress API verbosity
 * WordPress REST API returns ~5-10KB per post, we slim to ~500 bytes
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function slimPost(post: any): any {
  return {
    id: post.id,
    title: post.title?.rendered || post.title,
    slug: post.slug,
    status: post.status,
    date: post.date,
    modified: post.modified,
    link: post.link,
    excerpt: post.excerpt?.rendered?.replace(/<[^>]*>/g, "").trim().slice(0, 200) || "",
    author: post.author,
    categories: post.categories,
    tags: post.tags,
    featured_media: post.featured_media || null,
  };
}

export function slimPage(page: any): any {
  return {
    id: page.id,
    title: page.title?.rendered || page.title,
    slug: page.slug,
    status: page.status,
    date: page.date,
    modified: page.modified,
    link: page.link,
    parent: page.parent || 0,
    menu_order: page.menu_order || 0,
  };
}

export function slimUser(user: any): any {
  return {
    id: user.id,
    name: user.name,
    slug: user.slug,
    email: user.email,
    roles: user.roles,
  };
}

export function slimMedia(media: any): any {
  return {
    id: media.id,
    title: media.title?.rendered || media.title,
    source_url: media.source_url,
    mime_type: media.mime_type,
    alt_text: media.alt_text || "",
    date: media.date,
  };
}

export function slimPlugin(plugin: any): any {
  // Plugin key is like "akismet/akismet.php"
  return {
    plugin: plugin.plugin,
    name: plugin.name,
    status: plugin.status,
    version: plugin.version,
    author: plugin.author?.replace(/<[^>]*>/g, "") || "",
  };
}

export function slimTheme(theme: any): any {
  return {
    stylesheet: theme.stylesheet,
    name: theme.name?.rendered || theme.name,
    status: theme.status,
    version: theme.version,
    author: theme.author?.rendered?.replace(/<[^>]*>/g, "") || theme.author || "",
  };
}

export function slimComment(comment: any): any {
  return {
    id: comment.id,
    post: comment.post,
    author_name: comment.author_name,
    content: comment.content?.rendered?.replace(/<[^>]*>/g, "").trim().slice(0, 300) || "",
    date: comment.date,
    status: comment.status,
  };
}

export function slimCategory(cat: any): any {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    parent: cat.parent || 0,
    count: cat.count || 0,
  };
}

export function slimTag(tag: any): any {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    count: tag.count || 0,
  };
}

export function slimSiteInfo(info: any): any {
  return {
    name: info.name,
    description: info.description,
    url: info.url,
    home: info.home,
    timezone: info.timezone_string || info.gmt_offset,
    namespaces: info.namespaces?.length || 0,
  };
}
