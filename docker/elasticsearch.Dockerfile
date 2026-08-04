# 다국어(한/일/중) 형태소 분석을 위해 Nori/Kuromoji/SmartCN 플러그인을 포함한 커스텀 이미지.
# 베이스 이미지(docker.elastic.co/elasticsearch/elasticsearch)는 이 플러그인들을 기본 포함하지 않는다.
FROM docker.elastic.co/elasticsearch/elasticsearch:8.15.0

RUN bin/elasticsearch-plugin install --batch \
    analysis-nori \
    analysis-kuromoji \
    analysis-smartcn
