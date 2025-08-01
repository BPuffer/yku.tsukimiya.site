from flask import Flask, request, Response, make_response
import requests
from urllib.parse import urlparse, urljoin
import urllib3
urllib3.disable_warnings()
import re

app = Flask(__name__)

# 配置
proxy_host = 'localhost'
proxy_port = 5000
PROXY_URL = f'http://localhost:5000'  # 代理域名
FRONTEND_ORIGIN = "http://localhost:4000"  # 跨域允许目标域名

ssl_verify = False

def proxy_to(url):
    """
    URL转换函数，将目标URL转换为代理URL格式
    示例: https://e.cn/path -> https://proxy.cn/e.cn/path
    """
    if not url:
        return ''
    
    parsed = urlparse(url)
    proxy_path = f"{PROXY_URL}/{parsed.netloc}{parsed.path if parsed.path else ''}"
    if parsed.query:
        proxy_path += f"?{parsed.query}"
    if parsed.fragment:
        proxy_path += f"#{parsed.fragment}"
    
    return proxy_path

def process_set_cookie(cookie_header, target_domain):
    """
    处理Set-Cookie字段，使其储存到代理
    """
    new_cookie_headers = []
    for cookie in cookie_header.split(','):
        fields = list(map(
            lambda x: x.strip(),
            cookie.split(';')
        ))
        new_fields = []
        has_path_field = False
        for field in fields:
            if '=' in field:  # 键值对字段
                key, value = field.split('=', 1)
                if key.strip().lower() == 'domain':
                    continue
                if key.strip().lower() == 'path':
                    value = f"/{target_domain}{value}"
                    has_path_field = True
                if key.strip().lower() == 'samesite':
                    value = 'Lax'

                new_fields.append(f"{key}={value}")
            else:  # 无值字段直接加
                if not ssl_verify and field.strip().lower() == 'secure':
                    continue
                new_fields.append(field)
        if not has_path_field:
            new_fields.append(f"Path=/{target_domain}")
        new_cookie_headers.append('; '.join(new_fields).strip())
    
    new_cookie = ", ".join(new_cookie_headers).strip()
    print(f"处理了Cookie: \n{cookie_header}\nTo:\n{new_cookie}")
    return new_cookie

def revert_referer(proxied_url):
    """
    从代理URL中提取原始URL
    """
    print(f"处理Referer: {proxied_url}")
    if not proxied_url:
        return ''
    parsed = urlparse(proxied_url)
    domain = proxied_url.split(parsed.netloc)[-1].strip('/')
    if not domain:
        return ''
    return f"https://{domain}"

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST'])
@app.route('/<path:path>', methods=['GET', 'POST'])
def proxy(path):
    print(f"处理请求：{path}")
    # 构建目标URL
    target_domain = path.split('/')[0]
    target_url = f"https://{path}"
    if request.query_string:
        target_url += f"?{request.query_string.decode('utf-8')}"
    
    # 准备请求头
    headers = {}
    for key, value in request.headers:
        if key.lower() in ['referer']:
            # headers[key] = revert_referer(value)
            continue
        # 过滤掉Flask自动添加的头
        if key.lower() in ['host', 'content-length']:
            continue
        else:
            headers[key] = value
    
    # 转发请求
    resp = requests.request(
        method=request.method,
        url=target_url,
        headers=headers,
        data=request.get_data(),
        cookies=request.cookies,
        allow_redirects=False,
        verify=ssl_verify
    )
    
    # 处理响应
    new_resp_headers = []
    response = Response(resp.content, resp.status_code)
    for key, value in resp.headers.items():
        if key.lower() in ['content-encoding', 'content-length', 'transfer-encoding', 'connection']:
            continue
        if key.lower() == 'set-cookie':
            for cookie in process_set_cookie(value, target_domain).split(','):
                response.headers.add('Set-Cookie', cookie)
            continue
        elif key.lower() == 'location':
            value = proxy_to(value)
        
        new_resp_headers.append((key, value))
    
    # 构建Flask响应
    for key, value in new_resp_headers:
        response.headers[key] = value
    
    # 重写跨域
    response.headers['Access-Control-Allow-Origin'] = FRONTEND_ORIGIN
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = "true"
    return response

if __name__ == '__main__':
    app.run(host=proxy_host, port=proxy_port, debug=False)

if __name__ == '__main__2':
    print(proxy_to('http://jwgl.yku.edu.cn/sso.jsp?ticket=ST-3509-Eqor2q3ApswJA8SIMRYw-7Q4huolocalhost'))